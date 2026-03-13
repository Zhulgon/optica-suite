export interface JwtUser {
  sub: string;
  role: 'ADMIN' | 'ASESOR' | 'OPTOMETRA';
  email: string;
  tokenVersion: number;
  siteId?: string | null;
}
