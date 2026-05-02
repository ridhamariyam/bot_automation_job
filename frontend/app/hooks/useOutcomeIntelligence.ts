"use client";

import { useState, useCallback } from "react";
import { fetchOutcomeIntelligence, type OutcomeIntelligence } from "../lib/useScoringAPI";

export type IntelState = {
  data: OutcomeIntelligence | null;
  loading: boolean;
  error: string;
  load: () => Promise<void>;
};

export function useOutcomeIntelligence(email: string): IntelState {
  const [data, setData]       = useState<OutcomeIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const load = useCallback(async () => {
    if (!email || data) return; // lazy — only fetches once
    setLoading(true);
    setError("");
    try {
      setData(await fetchOutcomeIntelligence(email));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load intelligence data");
    } finally {
      setLoading(false);
    }
  }, [email, data]);

  return { data, loading, error, load };
}
