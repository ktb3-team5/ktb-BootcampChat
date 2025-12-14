import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import socketService from "../services/socket";
import { useAuth } from "../contexts/AuthContext";
import { useFileHandling } from "./useFileHandling";
import { useMessageHandling } from "./useMessageHandling";
import { useReactionHandling } from "./useReactionHandling";
import { useSocketHandling } from "./useSocketHandling";
import { useRoomHandling } from "./useRoomHandling";
import { Toast } from "../components/Toast";

const CLEANUP_REASONS = {
  DISCONNECT: "disconnect",
  MANUAL: "manual",
  RECONNECT: "reconnect",
  UNMOUNT: "unmount",
  ERROR: "error",
};

export const useChatRoom = () => {
  const router = useRouter();
  const roomId = router.query.room;
  const { user: authUser, logout } = useAuth();

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState("checking");
  const [messageLoadError, setMessageLoadError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Refs
  const messageInputRef = useRef(null);
  const messageLoadAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const setupCompleteRef = useRef(false);
  const socketInitializedRef = useRef(false);
  const cleanupInProgressRef = useRef(false);
  const userRooms = useRef(new Map());
  const previousMessagesRef = useRef(new Set());
  const messageProcessingRef = useRef(false);
  const initialLoadCompletedRef = useRef(false);
  const processedMessageIds = useRef(new Set());
  const loadMoreTimeoutRef = useRef(null);

  // ⭐ 추가 최적화용 Refs
  const socketListenersAttachedRef = useRef(false);
  const incomingMessageQueueRef = useRef([]);
  const flushMessagesTimeoutRef = useRef(null);

  const {
    connected,
    socketRef,
    handleConnectionError,
    handleReconnect,
    setConnected,
  } = useSocketHandling(router);

  // 메시지 관련 상태 & 핸들러
  const {
    message,
    showEmojiPicker,
    showMentionList,
    mentionFilter,
    mentionIndex,
    filePreview,
    uploading,
    uploadProgress,
    uploadError,
    setMessage,
    setShowEmojiPicker,
    setShowMentionList,
    setMentionFilter,
    setMentionIndex,
    setFilePreview,
    handleMessageChange,
    handleMessageSubmit,
    handleLoadMore,
    handleEmojiToggle,
    getFilteredParticipants,
    insertMention,
    removeFilePreview,
  } = useMessageHandling(
    socketRef,
    currentUser,
    router,
    undefined,
    messages,
    loadingMessages,
    setLoadingMessages
  );

  // ---------------------------------------------------
  // ✅ 최적화 5: cleanup 최소화 + 중복 방지
  // ---------------------------------------------------
  const cleanup = useCallback(
    (reason = "MANUAL") => {
      if (!mountedRef.current || !roomId) return;

      try {
        if (cleanupInProgressRef.current) return;
        cleanupInProgressRef.current = true;

        if (roomId && socketRef.current?.connected) {
          socketRef.current.emit("leaveRoom", roomId);
        }

        if (socketRef.current && reason !== "RECONNECT") {
          socketRef.current.off("message");
          socketRef.current.off("previousMessages");
          socketRef.current.off("previousMessagesLoaded");
          socketRef.current.off("participantsUpdate");
          socketRef.current.off("messagesRead");
          socketRef.current.off("messageReactionUpdate");
          socketRef.current.off("session_ended");
          socketRef.current.off("error");
        }

        // socket listener 플래그 초기화
        socketListenersAttachedRef.current = false;

        if (flushMessagesTimeoutRef.current) {
          clearTimeout(flushMessagesTimeoutRef.current);
          flushMessagesTimeoutRef.current = null;
        }
        incomingMessageQueueRef.current = [];

        if (loadMoreTimeoutRef.current) {
          clearTimeout(loadMoreTimeoutRef.current);
          loadMoreTimeoutRef.current = null;
        }

        processedMessageIds.current.clear();
        previousMessagesRef.current.clear();
        messageProcessingRef.current = false;

        if (reason === "MANUAL" && mountedRef.current) {
          setError(null);
          setLoading(false);
          setLoadingMessages(false);
          setMessages([]);
          if (userRooms.current.size > 0) {
            userRooms.current.clear();
          }
        } else if (reason === "DISCONNECT" && mountedRef.current) {
          setError("채팅 연결이 끊어졌습니다. 재연결을 시도합니다.");
        }
      } catch (e) {
        if (mountedRef.current) {
          setError("채팅방 정리 중 오류가 발생했습니다.");
        }
      } finally {
        cleanupInProgressRef.current = false;
      }
    },
    [roomId, socketRef, setMessages, setError, setLoading, setLoadingMessages]
  );

  const getConnectionState = useCallback(() => {
    if (!socketRef.current) return "disconnected";
    if (loading) return "connecting";
    if (error) return "error";
    return socketRef.current.connected ? "connected" : "disconnected";
  }, [loading, error, socketRef]);

  const { handleReactionAdd, handleReactionRemove, handleReactionUpdate } =
    useReactionHandling(socketRef, currentUser, messages, setMessages);

  // ---------------------------------------------------
  // ✅ 최적화 1: 메시지 정리/중복 제거 + 변경 없을 때 setMessages 스킵
  // ---------------------------------------------------
  const processMessages = useCallback(
    (loadedMessages, hasMore, isInitialLoad = false) => {
      try {
        if (!Array.isArray(loadedMessages)) {
          throw new Error("Invalid messages format");
        }

        // hasMore 상태는 중복 여부와 관계없이 항상 업데이트
        setHasMoreMessages(hasMore);
        if (isInitialLoad) {
          initialLoadCompletedRef.current = true;
        }

        setMessages((prev) => {
          if (!mountedRef.current) return prev;

          // 새 메시지 중복 필터링
          const newMessages = loadedMessages.filter((msg) => {
            if (!msg?._id) return false;
            if (processedMessageIds.current.has(msg._id)) return false;
            processedMessageIds.current.add(msg._id);
            return true;
          });

          if (newMessages.length === 0) {
            // 더 들어올 게 없으면 굳이 새 배열 만들지 않음
            return prev;
          }

          const map = new Map();
          prev.forEach((msg) => {
            if (msg?._id) map.set(msg._id, msg);
          });
          newMessages.forEach((msg) => {
            if (msg?._id) map.set(msg._id, msg);
          });

          const merged = Array.from(map.values()).sort(
            (a, b) =>
              new Date(a.timestamp || 0).getTime() -
              new Date(b.timestamp || 0).getTime()
          );

          return merged;
        });
      } catch (e) {
        throw e;
      }
    },
    [setMessages, setHasMoreMessages]
  );

  // ---------------------------------------------------
  // ✅ 최적화 3: 실시간 message 이벤트 batching
  // ---------------------------------------------------
  const flushIncomingMessages = useCallback(() => {
    if (!mountedRef.current) return;
    const queue = incomingMessageQueueRef.current;
    if (!queue.length) return;

    const batch = [...queue];
    incomingMessageQueueRef.current = [];
    flushMessagesTimeoutRef.current = null;

    setMessages((prev) => {
      if (!mountedRef.current) return prev;

      const map = new Map();
      prev.forEach((msg) => {
        if (msg?._id) map.set(msg._id, msg);
      });

      let hasNew = false;
      batch.forEach((msg) => {
        if (!msg?._id) return;
        if (!map.has(msg._id)) {
          map.set(msg._id, msg);
          hasNew = true;
        }
      });

      if (!hasNew) return prev;

      const merged = Array.from(map.values()).sort(
        (a, b) =>
          new Date(a.timestamp || 0).getTime() -
          new Date(b.timestamp || 0).getTime()
      );

      return merged;
    });
  }, [setMessages]);

  const enqueueIncomingMessage = useCallback(
    (message) => {
      if (!message?._id) return;
      if (processedMessageIds.current.has(message._id)) return;
      processedMessageIds.current.add(message._id);

      incomingMessageQueueRef.current.push(message);

      if (!flushMessagesTimeoutRef.current) {
        // 다음 프레임 또는 짧은 timeout에 한 번에 처리
        flushMessagesTimeoutRef.current = setTimeout(() => {
          flushIncomingMessages();
        }, 0);
      }
    },
    [flushIncomingMessages]
  );

  // ---------------------------------------------------
  // ✅ 최적화 4: previousMessages idle 처리
  // ---------------------------------------------------
  const runInIdle = useCallback((cb) => {
    if (typeof window === "undefined") {
      cb();
      return;
    }

    const win = window;
    const idle = win.requestIdleCallback || ((fn) => setTimeout(fn, 0));
    idle(() => {
      if (!mountedRef.current) return;
      cb();
    });
  }, []);

  const setupEventListeners = useCallback(() => {
    if (!socketRef.current || !mountedRef.current) return;

    // 이미 리스너 붙었으면 다시 붙이지 않음
    if (socketListenersAttachedRef.current) return;
    socketListenersAttachedRef.current = true;

    socketRef.current.on("participantsUpdate", (participants) => {
      if (!mountedRef.current) return;
      setRoom((prev) => ({
        ...prev,
        participants: participants || [],
      }));
    });

    socketRef.current.on(
      "messagesRead",
      ({ userId, messageIds, timestamp }) => {
        if (!mountedRef.current) return;
        if (!Array.isArray(messageIds) || !messageIds.length) return;

        setMessages((prev) =>
          prev.map((msg) => {
            if (!messageIds.includes(msg._id)) return msg;
            const alreadyRead = msg.readers?.some(
              (r) => r.userId === userId || r._id === userId
            );
            if (alreadyRead) return msg;
            return {
              ...msg,
              readers: [
                ...(msg.readers || []),
                { userId, readAt: timestamp || new Date() },
              ],
            };
          })
        );
      }
    );

    socketRef.current.on("message", (message) => {
      if (!mountedRef.current) return;
      enqueueIncomingMessage(message);
    });

    const handlePreviousMessages = (response) => {
      if (!mountedRef.current || messageProcessingRef.current) return;
      messageProcessingRef.current = true;

      runInIdle(() => {
        try {
          if (!response || typeof response !== "object") {
            throw new Error("Invalid response format");
          }

          const { messages: loadedMessages = [], hasMore } = response;
          const isInitialLoad = messages.length === 0;

          processMessages(loadedMessages, hasMore, isInitialLoad);
          setLoadingMessages(false);
        } catch (e) {
          setLoadingMessages(false);
          setError("메시지 처리 중 오류가 발생했습니다.");
          setHasMoreMessages(false);
        } finally {
          messageProcessingRef.current = false;
        }
      });
    };

    socketRef.current.on("previousMessages", handlePreviousMessages);
    socketRef.current.on("previousMessagesLoaded", handlePreviousMessages);

    socketRef.current.on("messageReactionUpdate", (data) => {
      if (!mountedRef.current) return;
      handleReactionUpdate(data);
    });

    socketRef.current.on("session_ended", () => {
      if (!mountedRef.current) return;
      cleanup();
      logout();
      router.replace("/?error=session_expired");
    });

    socketRef.current.on("error", (err) => {
      if (!mountedRef.current) return;
      console.error("Socket error:", err);
      if (err?.code === "MESSAGE_REJECTED") {
        Toast.error(
          err.message || "금칙어가 포함되어 메시지를 전송할 수 없습니다."
        );
        return;
      }
      setError(err.message || "채팅 연결에 문제가 발생했습니다.");
    });
  }, [
    socketRef,
    processMessages,
    setLoadingMessages,
    setHasMoreMessages,
    setError,
    logout,
    cleanup,
    handleReactionUpdate,
    enqueueIncomingMessage,
    runInIdle,
    messages.length,
  ]);

  const {
    setupRoom,
    joinRoom,
    loadInitialMessages,
    fetchRoomData,
    handleSessionError,
  } = useRoomHandling(
    socketRef,
    currentUser,
    mountedRef,
    router,
    setRoom,
    setError,
    setMessages,
    setHasMoreMessages,
    setLoadingMessages,
    setLoading,
    setupEventListeners,
    cleanup,
    loading,
    setIsInitialized,
    initializingRef,
    setupCompleteRef,
    userRooms.current,
    processMessages
  );

  // 소켓 연결 모니터링 useEffect
  useEffect(() => {
    if (!socketRef.current || !currentUser) return;

    const handleConnect = () => {
      if (!mountedRef.current) return;
      setConnectionStatus("connected");
      setConnected(true);

      if (
        roomId &&
        !setupCompleteRef.current &&
        !initializingRef.current &&
        !isInitialized
      ) {
        socketInitializedRef.current = true;
        setupRoom().catch(() => {
          setError("채팅방 연결에 실패했습니다.");
        });
      }
    };

    const handleDisconnect = (reason) => {
      if (!mountedRef.current) return;
      setConnectionStatus("disconnected");
      socketInitializedRef.current = false;
      setupCompleteRef.current = false;
    };

    const handleError = (err) => {
      if (!mountedRef.current) return;
      setConnectionStatus("error");
      setError("채팅 서버와의 연결이 끊어졌습니다.");
    };

    const handleReconnecting = (attemptNumber) => {
      if (!mountedRef.current) return;
      setConnectionStatus("connecting");
    };

    const handleReconnectSuccess = () => {
      if (!mountedRef.current) return;
      setConnectionStatus("connected");
      setConnected(true);
      setError("");

      if (roomId) {
        setupRoom().catch(() => {
          setError("채팅방 재연결에 실패했습니다.");
        });
      }
    };

    socketRef.current.on("connect", handleConnect);
    socketRef.current.on("disconnect", handleDisconnect);
    socketRef.current.on("connect_error", handleError);
    socketRef.current.on("reconnecting", handleReconnecting);
    socketRef.current.on("reconnect", handleReconnectSuccess);

    setConnectionStatus(
      socketRef.current.connected ? "connected" : "disconnected"
    );

    return () => {
      if (!socketRef.current) return;
      socketRef.current.off("connect", handleConnect);
      socketRef.current.off("disconnect", handleDisconnect);
      socketRef.current.off("connect_error", handleError);
      socketRef.current.off("reconnecting", handleReconnecting);
      socketRef.current.off("reconnect", handleReconnectSuccess);
    };
  }, [roomId, setupRoom, setConnected, currentUser, isInitialized, setError]);

  // 초기화 & 언마운트
  useEffect(() => {
    const initializeChat = async () => {
      if (initializingRef.current) return;

      if (!authUser) {
        router.replace("/?redirect=" + router.asPath);
        return;
      }

      if (!currentUser) {
        setCurrentUser(authUser);
      }

      if (!isInitialized && roomId) {
        try {
          initializingRef.current = true;
          await setupRoom();
        } catch (e) {
          setError("채팅방 초기화에 실패했습니다.");
        } finally {
          initializingRef.current = false;
        }
      }
    };

    mountedRef.current = true;

    if (roomId) {
      initializeChat();
    }

    const tokenCheckInterval = setInterval(() => {
      if (!mountedRef.current) return;
      if (!authUser) {
        clearInterval(tokenCheckInterval);
        router.replace("/?redirect=" + router.asPath);
      }
    }, 60000);

    return () => {
      mountedRef.current = false;
      clearInterval(tokenCheckInterval);

      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
      }

      if (
        socketRef.current?.connected &&
        roomId &&
        !cleanupInProgressRef.current
      ) {
        cleanup(CLEANUP_REASONS.UNMOUNT);
      }
    };
  }, [roomId, cleanup, setupRoom, isInitialized, setError, authUser]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socketRef.current?.connected && roomId) {
        socketRef.current.emit("leaveRoom", roomId);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [roomId]);

  const {
    fileInputRef,
    uploading: fileUploading,
    uploadProgress: fileUploadProgress,
    uploadError: fileUploadError,
    handleFileUpload,
    handleFileSelect,
    handleFileDrop,
    removeFilePreview: removeFile,
  } = useFileHandling(socketRef, currentUser, router);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleMessageSubmit(e);
      }
    },
    [handleMessageSubmit]
  );

  // ✅ retryMessageLoad
  const retryMessageLoad = useCallback(() => {
    if (!mountedRef.current || !roomId) return;
    messageLoadAttemptRef.current = 0;
    previousMessagesRef.current.clear();
    processedMessageIds.current.clear();
    initialLoadCompletedRef.current = false;
    loadInitialMessages(roomId);
  }, [loadInitialMessages, roomId]);

  return {
    room,
    messages,
    error,
    loading,
    connected,
    currentUser,
    message,
    showEmojiPicker,
    showMentionList,
    mentionFilter,
    mentionIndex,
    filePreview,
    uploading,
    uploadProgress,
    uploadError,
    hasMoreMessages,
    loadingMessages,

    fileInputRef,
    messageInputRef,
    socketRef,

    handleMessageChange,
    handleMessageSubmit,
    handleEmojiToggle,
    handleKeyDown,
    handleConnectionError,
    handleReconnect,
    getFilteredParticipants,
    insertMention,
    removeFilePreview,
    handleReactionAdd,
    handleReactionRemove,
    handleLoadMore,
    cleanup,

    setMessage,
    setShowEmojiPicker,
    setShowMentionList,
    setMentionFilter,
    setMentionIndex,
    setError,

    connectionStatus: getConnectionState(),
    messageLoadError,
    retryMessageLoad,
  };
};

export default useChatRoom;
