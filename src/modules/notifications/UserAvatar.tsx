import React from "react";
import { getAvatarUrl } from "../../api/client";

interface UserAvatarProps {
  name: string | null | undefined;
  surname: string | null | undefined;
  avatarFilename: string | null;
  size?: number;
  showTooltip?: boolean;
}

// Consistent color palette matching employees list
const AVATAR_PALETTE = [
  "#0D2137",
  "#163352",
  "#8B6914",
  "#1B4D3E",
  "#2C5282",
  "#5B2333",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export default function UserAvatar({
  name,
  surname,
  avatarFilename,
  size = 24,
  showTooltip = true,
}: UserAvatarProps) {
  const safeName = name || "";
  const safeSurname = surname || "";
  const fullName = `${safeName} ${safeSurname}`.trim() || "?";
  const initials = safeName && safeSurname 
    ? `${safeName.charAt(0)}${safeSurname.charAt(0)}`.toUpperCase()
    : fullName.charAt(0).toUpperCase();
  const bgColor = getAvatarColor(fullName);

  const avatarUrl = avatarFilename ? getAvatarUrl(avatarFilename) : null;

  return (
    <div
      title={showTooltip ? fullName : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: avatarUrl ? "transparent" : bgColor,
        border: "2px solid #fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        color: "#fff",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={fullName}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        initials
      )}
    </div>
  );
}
