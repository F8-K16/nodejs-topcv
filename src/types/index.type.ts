declare module "express" {
  export interface Request {
    user?: {
      id: number;
      username: string;
      email: string;
      isVerified: boolean;
      roles: string[];
      permissions: string[];
      createdAt: Date | null;
      updatedAt: Date | null;
    };
    tokenJti?: string;
    tokenExp?: number;
    requestId?: string;
  }
}
