import { PasswordHasher } from '@/application/ports';
import { hash, verify } from '@node-rs/argon2';

export class Argon2PasswordHasher implements PasswordHasher {
  constructor(private readonly options?: { fastHashing?: boolean }) {}

  async hash(password: string): Promise<string> {
    const memoryCost = this.options?.fastHashing ? 1024 : 19456;
    const timeCost = this.options?.fastHashing ? 1 : 2;
    const parallelism = 1;

    return hash(password, {
      memoryCost,
      timeCost,
      parallelism,
    });
  }

  async verify(hashStr: string, password: string): Promise<boolean> {
    return verify(hashStr, password);
  }
}
