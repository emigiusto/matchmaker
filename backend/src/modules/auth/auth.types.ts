// auth.types.ts – API-facing types for auth module

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  locale?: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
    isGuest: boolean;
    onboardingCompleted: boolean;
  };
  token: string;
}
