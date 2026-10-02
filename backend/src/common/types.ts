import type { RoleKey } from '@taskeno/contracts';

/** The authenticated caller, resolved once per request by the session guard. */
export type AuthenticatedUser = {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: RoleKey[];
  profile: {
    username: string;
    displayName: string;
    isProvider: boolean;
    avatarFileId: string | null;
  };
  sessionId: string;
};

/**
 * Everything an audited action needs to know about "who did this and from
 * where". Passed explicitly instead of hidden in a request-scoped provider so
 * services stay unit-testable.
 */
export type ActorContext = {
  userId: string | null;
  roles: RoleKey[];
  requestId: string;
  ip?: string;
  userAgent?: string;
};

export const systemActor = (requestId = 'system'): ActorContext => ({
  userId: null,
  roles: [],
  requestId,
});

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type MoneySerialized = string;
