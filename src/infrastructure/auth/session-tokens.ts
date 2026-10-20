import { SessionTokens } from '@/application/ports';
import crypto from 'crypto';

export class CryptoSessionTokens implements SessionTokens {
  generate(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
