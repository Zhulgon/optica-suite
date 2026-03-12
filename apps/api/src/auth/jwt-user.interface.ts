export interface JwtUser {
  sub: string;
  role: 'ADMIN' | 'ASESOR' | 'OPTOMETRA';
  email: string;
  tokenVersion: number;
}
