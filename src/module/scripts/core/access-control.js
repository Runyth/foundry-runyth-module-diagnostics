// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID } from "./constants.js";

export const ACCESS_SETTING_KEY = "playerAccess";

export function normalizeAllowedUserIds(value) {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(value?.allowedUserIds)
      ? value.allowedUserIds
      : [];
  return [...new Set(raw.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];
}

export function getAllowedUserIds() {
  try {
    return normalizeAllowedUserIds(game.settings.get(MODULE_ID, ACCESS_SETTING_KEY));
  } catch {
    return [];
  }
}

export function isDiagnosticsAuthorized(user = game.user, allowedUserIds = getAllowedUserIds()) {
  if (!user) return false;
  if (user.isGM) return true;
  return Boolean(user.id && allowedUserIds.includes(user.id));
}

export function selectablePlayerUsers(users = game.users) {
  if (!users) return [];
  return [...users]
    .filter((user) => user && !user.isGM && typeof user.id === "string")
    .map((user) => ({
      id: user.id,
      name: String(user.name ?? user.id),
      active: Boolean(user.active)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function sanitizeAllowedUserIds(userIds, users = game.users) {
  const selectable = new Set(selectablePlayerUsers(users).map((user) => user.id));
  return normalizeAllowedUserIds(userIds).filter((id) => selectable.has(id));
}

export async function setAllowedUserIds(userIds) {
  if (!game.user?.isGM) throw new Error(game.i18n?.localize?.("RMD.Notifications.GmOnlyAccess") ?? "Only a Game Master can configure diagnostics access.");
  const allowedUserIds = sanitizeAllowedUserIds(userIds);
  await game.settings.set(MODULE_ID, ACCESS_SETTING_KEY, { allowedUserIds });
  return allowedUserIds;
}
