"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Caricamento di dati al montaggio del componente.
 *
 * Esiste per raccogliere in un punto solo la deroga a
 * `react-hooks/set-state-in-effect`: la regola segnala qualunque funzione che
 * contenga setState e venga chiamata da un effetto, anche quando lo stato
 * cambia soltanto DOPO una chiamata di rete attesa - cioe' in una
 * continuazione, esattamente come la regola vorrebbe. Senza un punto unico
 * la deroga andrebbe ripetuta in ogni componente che carica qualcosa.
 */
export function useAsyncData<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const result = await load();
    setData(result);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { data, loading, reload };
}
