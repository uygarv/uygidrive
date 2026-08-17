"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { driveApi } from "@/lib/drive-api";

function initials(username) {
  return username ? username.slice(0, 2).toUpperCase() : "UD";
}

export function IdentityAvatar({ user, size = "default", className }) {
  const url = driveApi.avatarUrl(user);
  return <Avatar size={size} className={className}><AvatarImage src={url || undefined} alt={user?.username ? `@${user.username}` : "Profile photo"} /><AvatarFallback>{initials(user?.username)}</AvatarFallback></Avatar>;
}
