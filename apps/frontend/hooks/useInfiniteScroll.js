import { useRef, useEffect, useCallback, useMemo } from "react";

/**
 * 최적화된 IntersectionObserver 기반 무한 스크롤 훅
 */
export const useInfiniteScroll = (
  onLoadMore,
  hasMore = true,
  isLoading = false,
  options = {}
) => {
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  /** 🔥 상태를 ref에 저장 → 콜백이 재생성되지 않아도 최신값 유지 */
  const hasMoreRef = useRef(hasMore);
  const isLoadingRef = useRef(isLoading);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  /** 🔥 stable callback: deps = [] */
  const handleIntersect = useCallback((entries) => {
    const [entry] = entries;

    if (entry.isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
      onLoadMoreRef.current?.();
    }
  }, []);

  /** 🔥 options 객체를 useMemo로 안정화 */
  const observerOptions = useMemo(
    () => ({
      root: options.root || null,
      rootMargin: options.rootMargin || "0px",
      threshold: options.threshold ?? 0.1,
    }),
    [options.root, options.rootMargin, options.threshold]
  );

  /** 🔥 Observer는 deps가 거의 변하지 않아야 함 */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    if (!hasMoreRef.current) return;

    // Observer 생성
    observerRef.current = new IntersectionObserver(
      handleIntersect,
      observerOptions
    );
    observerRef.current.observe(sentinel);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [observerOptions, handleIntersect]); // observerOptions 변경될 때만 실행됨

  return { sentinelRef };
};

export default useInfiniteScroll;
