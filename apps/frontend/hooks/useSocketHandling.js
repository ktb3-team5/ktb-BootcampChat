// import { useState, useRef, useCallback, useEffect, useMemo } from "react";
// import socketService from "../services/socket";
// import { Toast } from "../components/Toast";
// import createDebounce from "@/utils/debounce";

// export const useSocketHandling = (router, maxRetries = 5) => {
//   const [connected, setConnected] = useState(false);
//   const [isReconnecting, _setIsReconnecting] = useState(false);
//   const [retryCount, setRetryCount] = useState(0);

//   const socketRef = useRef(null);
//   const retryCountRef = useRef(0);
//   const isReconnectingRef = useRef(false);
//   const internalReconnectRef = useRef(null);
//   const reconnectCallbackRef = useRef(null);

//   const roomId = useMemo(() => router?.query?.room, [router?.query?.room]);

//   const setIsReconnecting = useCallback((value) => {
//     isReconnectingRef.current = value;
//     _setIsReconnecting(value);
//   }, []);

//   const cleanupSocket = useCallback(() => {
//     if (!socketRef.current) return;

//     try {
//       socketRef.current.removeAllListeners();
//     } catch {}

//     socketRef.current.disconnect();
//     socketRef.current = null;
//   }, []);

//   const getRetryDelay = useCallback(
//     (retry) => Math.min(1000 * Math.pow(2, retry), 8000),
//     []
//   );

//   // ------------------------------------------
//   // ⭐ 재연결 Debounce: 최신 콜백+상태만 참조하도록 ref 기반 처리
//   // ------------------------------------------
//   const debouncedReconnect = useMemo(() => {
//     return createDebounce((...args) => {
//       if (reconnectCallbackRef.current) {
//         reconnectCallbackRef.current(...args);
//       }
//     }, 1500);
//   }, []);

//   // 최신 reconnect 로직을 ref에 저장
//   reconnectCallbackRef.current = (currentUser, handleSessionError) => {
//     const attempts = retryCountRef.current;

//     if (attempts >= maxRetries) {
//       Toast.error("서버와 연결할 수 없습니다. 새로고침해주세요.");
//       setIsReconnecting(false);
//       return;
//     }

//     const delay = getRetryDelay(attempts);

//     retryCountRef.current = attempts + 1;
//     setRetryCount(attempts + 1);

//     setTimeout(() => {
//       internalReconnectRef.current?.(currentUser, handleSessionError);
//     }, delay);
//   };
//   // ------------------------------------------

//   const internalReconnect = useCallback(
//     async (currentUser, handleSessionError) => {
//       if (isReconnectingRef.current) return;
//       if (!currentUser?.token || !currentUser?.sessionId) return;

//       setIsReconnecting(true);
//       setConnected(false);

//       cleanupSocket();

//       try {
//         const socket = await socketService.connect({
//           auth: {
//             token: currentUser.token,
//             sessionId: currentUser.sessionId,
//           },
//           transports: ["websocket"],
//           reconnection: false,
//         });

//         socketRef.current = socket;

//         socket.on("connect", () => {
//           setConnected(true);
//           setIsReconnecting(false);
//           retryCountRef.current = 0;
//           setRetryCount(0);

//           if (roomId) {
//             socket.emit("joinRoom", roomId);
//           }
//         });

//         socket.on("disconnect", (reason) => {
//           setConnected(false);
//           if (reason !== "io client disconnect") {
//             debouncedReconnect(currentUser, handleSessionError);
//           }
//         });

//         socket.on("connect_error", (error) => {
//           if (
//             error?.message?.includes("세션") ||
//             error?.message?.includes("인증") ||
//             error?.message?.includes("토큰")
//           ) {
//             setIsReconnecting(false);
//             return handleSessionError?.();
//           }
//           debouncedReconnect(currentUser, handleSessionError);
//         });
//       } catch {
//         debouncedReconnect(currentUser, handleSessionError);
//       }
//     },
//     [cleanupSocket, roomId, debouncedReconnect]
//   );

//   // 최신 internalReconnect 저장
//   useEffect(() => {
//     internalReconnectRef.current = internalReconnect;
//   }, [internalReconnect]);

//   useEffect(() => {
//     return () => {
//       cleanupSocket();
//       debouncedReconnect.cancel();
//       retryCountRef.current = 0;
//       setRetryCount(0);
//       setIsReconnecting(false);
//     };
//   }, [cleanupSocket, debouncedReconnect, setIsReconnecting]);

//   return {
//     socketRef,
//     connected,
//     isReconnecting,
//     reconnect: internalReconnect,
//   };
// };

// export default useSocketHandling;

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import socketService from "../services/socket";
import { Toast } from "../components/Toast";
import createDebounce from "@/utils/debounce";
import { unstable_batchedUpdates } from "react-dom";

export const useSocketHandling = (router, maxRetries = 5) => {
  // 실제 UI 갱신이 필요한 최소 상태만 state로 관리
  const [connected, _setConnected] = useState(false);
  const [isReconnecting, _setIsReconnecting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // 렌더링을 유발하지 않는 ref 기반 상태 관리
  const socketRef = useRef(null);
  const connectedRef = useRef(false);
  const retryCountRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const internalReconnectRef = useRef(null);
  const reconnectCallbackRef = useRef(null);

  const roomId = useMemo(() => router?.query?.room, [router?.query?.room]);

  // ------------------------------------------
  // Setter: ref + state 동기화 (UI 필요 시에만 렌더링)
  // ------------------------------------------
  const setConnected = useCallback((v) => {
    connectedRef.current = v;
    _setConnected(v);
  }, []);

  const setIsReconnecting = useCallback((v) => {
    isReconnectingRef.current = v;
    _setIsReconnecting(v);
  }, []);

  // ------------------------------------------
  // 소켓 정리
  // ------------------------------------------
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
  // ⭐ 재연결 Debounce with latest callback
  // ------------------------------------------
  const debouncedReconnect = useMemo(() => {
    return createDebounce((...args) => {
      reconnectCallbackRef.current?.(...args);
    }, 1500);
  }, []);

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
  // ⭐ 소켓 재연결 (핵심 최적화 포함)
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

        // ---------------------------
        // ⭐ 이벤트 핸들러 ref로 저장
        // ⭐ batching 적용
        // ---------------------------
        const handlers = {
          connect: () => {
            unstable_batchedUpdates(() => {
              setConnected(true);
              setIsReconnecting(false);
              retryCountRef.current = 0;
              setRetryCount(0);
            });

            if (roomId) socket.emit("joinRoom", roomId);
          },

          disconnect: (reason) => {
            unstable_batchedUpdates(() => {
              setConnected(false);
            });

            if (reason !== "io client disconnect") {
              debouncedReconnect(currentUser, handleSessionError);
            }
          },

          connect_error: (error) => {
            if (
              error?.message?.includes("세션") ||
              error?.message?.includes("인증") ||
              error?.message?.includes("토큰")
            ) {
              setIsReconnecting(false);
              return handleSessionError?.();
            }

            debouncedReconnect(currentUser, handleSessionError);
          },
        };

        // 소켓 이벤트 전부 ref 기반 등록
        Object.entries(handlers).forEach(([event, handler]) => {
          socket.on(event, handler);
        });
      } catch {
        debouncedReconnect(currentUser, handleSessionError);
      }
    },
    [cleanupSocket, roomId, debouncedReconnect]
  );

  // 최신 reconnect 유지
  useEffect(() => {
    internalReconnectRef.current = internalReconnect;
  }, [internalReconnect]);

  // 언마운트 시 정리
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
