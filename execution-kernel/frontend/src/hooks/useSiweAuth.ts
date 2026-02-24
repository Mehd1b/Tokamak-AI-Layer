'use client';

import { useAccount, useSignMessage } from 'wagmi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SiweMessage } from 'siwe';
import { useCallback } from 'react';

export function useSiweAuth() {
  const { address, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['siwe-session'],
    queryFn: async () => {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      return data.address as string | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const signIn = useMutation({
    mutationFn: async () => {
      if (!address || !chain) throw new Error('Wallet not connected');

      // Get nonce
      const nonceRes = await fetch('/api/auth/nonce');
      const { nonce } = await nonceRes.json();

      // Create SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to comment on Execution Kernel vaults.',
        uri: window.location.origin,
        version: '1',
        chainId: chain.id,
        nonce,
      });
      const messageStr = message.prepareMessage();

      // Sign
      const signature = await signMessageAsync({ message: messageStr });

      // Verify
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageStr, signature }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Verification failed');
      }

      return verifyRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siwe-session'] });
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siwe-session'] });
    },
  });

  const isSignedIn = !!session && session.toLowerCase() === address?.toLowerCase();

  return {
    session,
    sessionLoading,
    isSignedIn,
    signIn: signIn.mutateAsync,
    signInPending: signIn.isPending,
    signInError: signIn.error,
    signOut: signOut.mutateAsync,
    signOutPending: signOut.isPending,
  };
}
