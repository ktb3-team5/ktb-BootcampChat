import React, { useMemo } from "react";
import { GroupOutlineIcon } from "@vapor-ui/icons";
import { HStack, VStack, Text, Badge, Collapsible } from "@vapor-ui/core";
import CustomAvatar from "./CustomAvatar";

const MAX_VISIBLE_AVATARS = 3;

const ChatRoomInfo = ({ room, connectionStatus }) => {
  const participants = room?.participants || [];

  const status = useMemo(() => {
    switch (connectionStatus) {
      case "connecting":
        return { label: "연결 중...", color: "warning" };
      case "connected":
        return { label: "연결됨", color: "success" };
      default:
        return { label: "연결 끊김", color: "danger" };
    }
  }, [connectionStatus]);

  /** -----------------------
   *  아바타 목록 memoization
   *  -----------------------
   */
  const avatarList = useMemo(() => {
    const visible = participants.slice(0, MAX_VISIBLE_AVATARS);
    const remaining = participants.length - visible.length;

    return { visible, remaining };
  }, [participants]);

  /** -----------------------
   *  Collapsible Panel 목록도 memo
   *  -----------------------
   */
  const participantList = useMemo(() => {
    return participants.map((p) => (
      <HStack
        key={p._id}
        gap="$200"
        alignItems="center"
        className="px-2 py-2 hover:bg-background-contrast-100 rounded-lg transition-colors"
      >
        <CustomAvatar user={p} size="md" showInitials />
        <VStack gap="$050">
          <Text
            typography="body2"
            className="font-medium text-foreground-normal-200"
          >
            {p.name}
          </Text>
          {p.email && (
            <Text typography="body3" foreground="hint">
              {p.email}
            </Text>
          )}
        </VStack>
      </HStack>
    ));
  }, [participants]);

  return (
    <Collapsible.Root>
      <HStack
        justifyContent="space-between"
        alignItems="center"
        width="100%"
        paddingX="$400"
        paddingY="$100"
        className="bg-surface-200 relative"
      >
        {/* 아바타 + 참여자 숫자 */}
        <Collapsible.Trigger
          render={
            <button className="bg-transparent border-none cursor-pointer flex items-center gap-2 hover:bg-background-contrast-100 rounded-lg px-2 py-1 -ml-2 transition-colors group">
              <HStack gap="$100" alignItems="center">
                <div className="flex -space-x-2">
                  {avatarList.visible.map((p, i) => (
                    <div
                      key={p._id}
                      className="ring-1 rounded-full"
                      style={{ zIndex: MAX_VISIBLE_AVATARS - i }}
                    >
                      <CustomAvatar user={p} size="sm" showInitials />
                    </div>
                  ))}
                  {avatarList.remaining > 0 && (
                    <div className="w-8 h-8 rounded-full bg-background-contrast-200 ring-1 flex items-center justify-center">
                      <span className="text-xs font-medium text-foreground-hint-100">
                        +{avatarList.remaining}
                      </span>
                    </div>
                  )}
                </div>

                <HStack gap="$050" alignItems="center" className="ml-1">
                  <GroupOutlineIcon className="text-foreground-hint-100 group-hover:text-foreground-normal-100" />
                  <Text
                    typography="body2"
                    className="text-foreground-hint-100 group-hover:text-foreground-normal-100 font-medium"
                  >
                    {participants.length}명
                  </Text>
                </HStack>
              </HStack>
            </button>
          }
        />

        {/* 채팅방 제목 */}
        <Text
          typography="heading4"
          className="font-semibold text-foreground-normal-200 absolute left-1/2 transform -translate-x-1/2"
        >
          {room?.name || "채팅방"}
        </Text>

        {/* 연결 상태 */}
        <Badge colorPalette={status.color} size="sm">
          {status.label}
        </Badge>
      </HStack>

      {/* Collapsible Panel */}
      <Collapsible.Panel>
        <div className="bg-surface-200 border-b border-border-secondary">
          <VStack gap="$100" padding="$300">
            <Text
              typography="subtitle2"
              className="text-foreground-normal-100 px-2"
            >
              참여자 목록
            </Text>
            <div className="max-h-64 overflow-y-auto">{participantList}</div>
          </VStack>
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
};

/* ------------------------------
   최적화: React.memo + shallow compare
------------------------------ */
function areEqual(prev, next) {
  if (prev.connectionStatus !== next.connectionStatus) return false;
  if (prev.room?.name !== next.room?.name) return false;

  const prevList = prev.room?.participants;
  const nextList = next.room?.participants;

  // 길이가 달라지면 변경
  if (prevList?.length !== nextList?.length) return false;

  // 길이가 같지만 레퍼런스가 다르면 변경된 것으로 판단
  if (prevList !== nextList) return false;

  return true;
}

export default React.memo(ChatRoomInfo, areEqual);
