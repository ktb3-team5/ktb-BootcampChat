import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import socketService from "../services/socket";
import { Toast } from "../components/Toast";
import createDebounce from "@/utils/debounce";

export const useSocketHandling = (router, maxRetries = 5) => {
  const [connected, setConnected] = useState(false);
  const [isReconnecting, _setIsReconnecting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const socketRef = useRef(null);
  const retryCountRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const internalReconnectRef = useRef(null);
  const reconnectCallbackRef = useRef(null);

  const roomId = useMemo(() => router?.query?.room, [router?.query?.room]);

  const setIsReconnecting = useCallback((value) => {
    isReconnectingRef.current = value;
    _setIsReconnecting(value);
  }, []);

  const cleanupSocket = useCallback(() => {
    if (!socketRef.current) return;

    try {
      socketRef.current.removeAllListeners();
    } catch {}

    socketRef.current.disconnect();
    socketRef.current = null;
  }, []);

  const getRetryDelay = useCallback(
    (retry) => Math.min(1000 * Math.pow(2, retry), 8000),
    []
  );

  // ------------------------------------------
  // ⭐ 재연결 Debounce: 최신 콜백+상태만 참조하도록 ref 기반 처리
  // ------------------------------------------
  const debouncedReconnect = useMemo(() => {
    return createDebounce((...args) => {
      if (reconnectCallbackRef.current) {
        reconnectCallbackRef.current(...args);
      }
    }, 1500);
  }, []);

  // 최신 reconnect 로직을 ref에 저장
  reconnectCallbackRef.current = (currentUser, handleSessionError) => {
    const attempts = retryCountRef.current;

    if (attempts >= maxRetries) {
      Toast.error("서버와 연결할 수 없습니다. 새로고침해주세요.");
      setIsReconnecting(false);
      return;
    }

    const delay = getRetryDelay(attempts);

    retryCountRef.current = attempts + 1;
    setRetryCount(attempts + 1);

    setTimeout(() => {
      internalReconnectRef.current?.(currentUser, handleSessionError);
    }, delay);
  };
  // ------------------------------------------

  const internalReconnect = useCallback(
    async (currentUser, handleSessionError) => {
      if (isReconnectingRef.current) return;
      if (!currentUser?.token || !currentUser?.sessionId) return;

      setIsReconnecting(true);
      setConnected(false);

      cleanupSocket();

      try {
        const socket = await socketService.connect({
          auth: {
            token: currentUser.token,
            sessionId: currentUser.sessionId,
          },
          transports: ["websocket"],
          reconnection: false,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          setConnected(true);
          setIsReconnecting(false);
          retryCountRef.current = 0;
          setRetryCount(0);

          if (roomId) {
            socket.emit("joinRoom", roomId);
          }
        });

        socket.on("disconnect", (reason) => {
          setConnected(false);
          if (reason !== "io client disconnect") {
            debouncedReconnect(currentUser, handleSessionError);
          }
        });

        socket.on("connect_error", (error) => {
          if (
            error?.message?.includes("세션") ||
            error?.message?.includes("인증") ||
            error?.message?.includes("토큰")
          ) {
            setIsReconnecting(false);
            return handleSessionError?.();
          }
          debouncedReconnect(currentUser, handleSessionError);
        });
      } catch {
        debouncedReconnect(currentUser, handleSessionError);
      }
    },
    [cleanupSocket, roomId, debouncedReconnect]
  );

  // 최신 internalReconnect 저장
  useEffect(() => {
    internalReconnectRef.current = internalReconnect;
  }, [internalReconnect]);

  useEffect(() => {
    return () => {
      cleanupSocket();
      debouncedReconnect.cancel();
      retryCountRef.current = 0;
      setRetryCount(0);
      setIsReconnecting(false);
    };
  }, [cleanupSocket, debouncedReconnect, setIsReconnecting]);

  return {
    socketRef,
    connected,
    isReconnecting,
    reconnect: internalReconnect,
  };
};

export default useSocketHandling;
