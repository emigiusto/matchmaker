// users.types.ts
// User = identity + contact info only. Guest-first philosophy.

export type User = {
  id: string;
  name?: string;
  phone?: string;
  isGuest: boolean;
  createdAt: string;
  updatedAt: string;
};
