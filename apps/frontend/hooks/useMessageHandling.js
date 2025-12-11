import { useReducer, useCallback, useRef, useEffect } from "react";
import { Toast } from "../components/Toast";
import fileService from "../services/fileService";

// -------------------------
// 1. 상태 관리 최적화 (useReducer)
// -------------------------
const initialState = {
  message: "",
  showEmojiPicker: false,
  showMentionList: false,
  mentionFilter: "",
  mentionIndex: 0,
  filePreview: null,
  uploading: false,
  uploadProgress: 0,
  uploadError: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_MESSAGE":
      return { ...state, message: action.payload };
    case "SET_SHOW_EMOJI":
      return { ...state, showEmojiPicker: action.payload };
    case "SET_SHOW_MENTION":
      return { ...state, showMentionList: action.payload };
    case "SET_MENTION_FILTER":
      return { ...state, mentionFilter: action.payload };
    case "SET_MENTION_INDEX":
      return { ...state, mentionIndex: action.payload };
    case "SET_FILE_PREVIEW":
      return { ...state, filePreview: action.payload };
    case "SET_UPLOAD":
      return { ...state, uploading: action.payload };
    case "SET_UPLOAD_PROGRESS":
      return { ...state, uploadProgress: action.payload };
    case "SET_UPLOAD_ERROR":
      return { ...state, uploadError: action.payload };
    case "RESET_UPLOAD_STATE":
      return {
        ...state,
        filePreview: null,
        uploadError: null,
        uploadProgress: 0,
        uploading: false,
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------
// 2. 최적화된 useMessageHandling
// ---------------------------------------------------------
export const useMessageHandling = (
  socketRef,
  currentUser,
  router,
  handleSessionError,
  messages = [],
  loadingMessages = false,
  setLoadingMessages
) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const roomIdRef = useRef(router.query?.room);

  // router.query.room 변경되면 ref만 업데이트 → 콜백 재생성 방지
  useEffect(() => {
    roomIdRef.current = router.query?.room;
  }, [router.query?.room]);

  // -------------------------
  // 메시지 입력 핸들러
  // -------------------------
  const handleMessageChange = useCallback((e) => {
    const newValue = e.target.value;
    dispatch({ type: "SET_MESSAGE", payload: newValue });

    const cursor = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursor);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const mentionText = textBeforeCursor.slice(atIndex + 1);
      if (!mentionText.includes(" ")) {
        dispatch({
          type: "SET_MENTION_FILTER",
          payload: mentionText.toLowerCase(),
        });
        dispatch({ type: "SET_SHOW_MENTION", payload: true });
        dispatch({ type: "SET_MENTION_INDEX", payload: 0 });
        return;
      }
    }

    dispatch({ type: "SET_SHOW_MENTION", payload: false });
  }, []);

  // -------------------------
  // 이전 메시지 로드
  // -------------------------
  const handleLoadMore = useCallback(() => {
    if (
      !socketRef.current?.connected ||
      loadingMessages ||
      messages.length === 0
    )
      return;

    const oldestMessage = messages[0]; // 정렬 X: 상위에서 정렬되어 내려온다고 가정
    const beforeTimestamp = oldestMessage?.timestamp;
    if (!beforeTimestamp) return;

    setLoadingMessages(true);

    socketRef.current.emit("fetchPreviousMessages", {
      roomId: roomIdRef.current,
      before: beforeTimestamp,
      limit: 30,
    });
  }, [socketRef, loadingMessages, messages, setLoadingMessages]);

  // -------------------------
  // 메시지 전송
  // -------------------------
  const handleMessageSubmit = useCallback(
    async (messageData) => {
      if (!socketRef.current?.connected || !currentUser) {
        Toast.error("채팅 서버와 연결이 끊어졌습니다.");
        return;
      }

      const roomId = roomIdRef.current;
      if (!roomId) {
        Toast.error("채팅방 정보를 찾을 수 없습니다.");
        return;
      }

      try {
        // 파일 메시지
        if (messageData.type === "file") {
          dispatch({ type: "SET_UPLOAD", payload: true });
          dispatch({ type: "SET_UPLOAD_ERROR", payload: null });
          dispatch({ type: "SET_UPLOAD_PROGRESS", payload: 0 });

          const uploadResponse = await fileService.uploadFile(
            messageData.fileData.file,
            (progress) =>
              dispatch({ type: "SET_UPLOAD_PROGRESS", payload: progress }),
            currentUser.token,
            currentUser.sessionId
          );

          if (!uploadResponse.success) {
            throw new Error(uploadResponse.message || "파일 업로드 실패");
          }

          socketRef.current.emit("chatMessage", {
            room: roomId,
            type: "file",
            content: messageData.content || "",
            fileData: {
              _id: uploadResponse.data.file._id,
              filename: uploadResponse.data.file.filename,
              originalname: uploadResponse.data.file.originalname,
              mimetype: uploadResponse.data.file.mimetype,
              size: uploadResponse.data.file.size,
            },
          });

          dispatch({ type: "RESET_UPLOAD_STATE" });
          dispatch({ type: "SET_MESSAGE", payload: "" });

          return;
        }

        // 텍스트 메시지
        if (messageData.content?.trim()) {
          socketRef.current.emit("chatMessage", {
            room: roomId,
            type: "text",
            content: messageData.content.trim(),
          });
        }

        dispatch({ type: "SET_MESSAGE", payload: "" });
        dispatch({ type: "SET_SHOW_MENTION", payload: false });
        dispatch({ type: "SET_SHOW_EMOJI", payload: false });
      } catch (error) {
        if (
          error.message?.includes("세션") ||
          error.message?.includes("토큰")
        ) {
          await handleSessionError();
          return;
        }

        Toast.error(error.message || "메시지 전송 오류");
        dispatch({ type: "SET_UPLOAD_ERROR", payload: error.message });
        dispatch({ type: "SET_UPLOAD", payload: false });
      }
    },
    [socketRef, currentUser, handleSessionError]
  );

  // -------------------------
  // 이모지
  // -------------------------
  const handleEmojiToggle = useCallback(() => {
    dispatch({ type: "SET_SHOW_EMOJI", payload: (prev) => !prev });
  }, []);

  // -------------------------
  // 멘션 필터
  // -------------------------
  const getFilteredParticipants = useCallback(
    (room) => {
      if (!room?.participants) return [];
      return room.participants.filter(
        (user) =>
          user.name.toLowerCase().includes(state.mentionFilter) ||
          user.email.toLowerCase().includes(state.mentionFilter)
      );
    },
    [state.mentionFilter]
  );

  // -------------------------
  // 멘션 삽입
  // -------------------------
  const insertMention = useCallback(
    (inputRef, user) => {
      if (!inputRef?.current) return;

      const cursor = inputRef.current.selectionStart;
      const textBefore = state.message.slice(0, cursor);
      const atIndex = textBefore.lastIndexOf("@");

      if (atIndex !== -1) {
        const newMessage =
          state.message.slice(0, atIndex) +
          `@${user.name} ` +
          state.message.slice(cursor);

        dispatch({ type: "SET_MESSAGE", payload: newMessage });
        dispatch({ type: "SET_SHOW_MENTION", payload: false });

        setTimeout(() => {
          const newPos = atIndex + user.name.length + 2;
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newPos, newPos);
        }, 0);
      }
    },
    [state.message]
  );

  // -------------------------
  // 파일 프리뷰 제거
  // -------------------------
  const removeFilePreview = useCallback(() => {
    dispatch({ type: "RESET_UPLOAD_STATE" });
  }, []);

  return {
    ...state,
    setMessage: (v) => dispatch({ type: "SET_MESSAGE", payload: v }),
    handleMessageChange,
    handleMessageSubmit,
    handleEmojiToggle,
    handleLoadMore,
    getFilteredParticipants,
    insertMention,
    removeFilePreview,
    dispatch, // 필요하면 외부에서 직접 dispatch 사용 가능
  };
};

export default useMessageHandling;
