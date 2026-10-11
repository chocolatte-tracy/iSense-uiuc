import { useEffect, useRef, useState } from 'react';
import { createPlacesSession, type PlaceSuggestion, type PlacesOptions } from '@/lib/places-search';

export type PlacesSearchState = {
  suggestions: PlaceSuggestion[];
  status: 'idle' | 'loading' | 'no-results' | 'unavailable' | 'error';
  message: string;
  select: (suggestion: PlaceSuggestion) => Promise<Awaited<ReturnType<ReturnType<typeof createPlacesSession>['select']>>>;
};

export function usePlacesAutocomplete(options: PlacesOptions | undefined, query: string, active: boolean): PlacesSearchState {
  const sessionRef = useRef<ReturnType<typeof createPlacesSession> | null>(null);
  const sessionKeyRef = useRef<string | undefined>(undefined);
  const requestRef = useRef(0);
  const latestRef = useRef({ query, active });
  latestRef.current = { query, active };
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<PlacesSearchState['status']>('idle');
  const [message, setMessage] = useState('');

  const enabled = Boolean(options?.enabled && options.apiKey);
  const trimmedQuery = query.trim();
  const shouldSearch = active && trimmedQuery.length >= 3;

  useEffect(() => {
    if (!shouldSearch) {
      requestRef.current += 1;
      setSuggestions([]);
      setStatus(options && !options.enabled ? 'unavailable' : 'idle');
      setMessage(options && !options.enabled ? options.message : '');
      return;
    }
    if (!enabled) {
      requestRef.current += 1;
      setSuggestions([]);
      setStatus('unavailable');
      setMessage(options?.message || 'Address search is unavailable right now.');
      return;
    }

    const requestId = ++requestRef.current;
    setSuggestions([]);
    setStatus('idle');
    setMessage('');
    const timer = window.setTimeout(() => {
      if (!sessionRef.current || sessionKeyRef.current !== options?.apiKey) {
        sessionRef.current?.reset();
        sessionRef.current = createPlacesSession(options!.apiKey!);
        sessionKeyRef.current = options!.apiKey;
      }
      const session = sessionRef.current;
      setStatus('loading');
      session.suggest(trimmedQuery).then(results => {
        if (requestRef.current !== requestId || latestRef.current.query.trim() !== trimmedQuery || !latestRef.current.active) return;
        setSuggestions(results);
        setStatus(results.length ? 'idle' : 'no-results');
        setMessage('');
      }).catch(error => {
        if (requestRef.current !== requestId || latestRef.current.query.trim() !== trimmedQuery || !latestRef.current.active) return;
        setSuggestions([]);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Address search could not be completed.');
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [enabled, options?.apiKey, options?.enabled, options?.message, shouldSearch, trimmedQuery]);

  useEffect(() => () => {
    requestRef.current += 1;
    sessionRef.current?.reset();
    sessionRef.current = null;
  }, []);

  const select = async (suggestion: PlaceSuggestion) => {
    if (!sessionRef.current || !enabled) throw new Error(options?.message || 'Address search is unavailable right now.');
    return sessionRef.current.select(suggestion);
  };

  return { suggestions, status, message, select };
}
