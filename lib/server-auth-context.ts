import { headers } from 'next/headers';
import {
  readRequestAuthContext,
  type RequestAuthContext,
} from '@/lib/request-auth-context';

export async function getVerifiedRequestAuthContext(): Promise<RequestAuthContext | null> {
  return readRequestAuthContext(await headers());
}
