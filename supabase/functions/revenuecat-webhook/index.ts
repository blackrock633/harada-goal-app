import { handleNativeBilling } from '../_shared/native-billing.ts';
import { nativeConfig, nativeDeps } from '../_shared/native-billing-deps.ts';
Deno.serve((req: Request) => handleNativeBilling(req, nativeConfig, nativeDeps, true));
