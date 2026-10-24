// ACT I (continued) — Mechanism Atlas: the SCN2A protein landscape of prior synthetic evidence.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { Workspace } from '../../ui/Workspace';
import { EmptyState } from '../../ui/primitives';
import { getAtlasIndex } from './atlasData';
import { runSearch } from './atlasSearch';
import { AtlasCanvas, type AtlasCanvasHandle } from './AtlasCanvas';
import { AtlasSidebar } from './AtlasSidebar';
import { AtlasInspector } from './AtlasInspector';
import { characterizationStatus, mechanismKnown } from './evidenceStatus';

/** Last atlasFocus nonce this module animated to (persists across mounts). */
let handledNonce = -1;
/** Whether the atlas has completed its first-ever focus flight. */
let everFocused = false;
/** Search query persists across navigation. */
let savedQuery = '';

export function AtlasModule() {
  const index = useMemo(() => getAtlasIndex(), []);
  const selectedVariantId = useStore((s) => s.selectedVariantId);
  const atlasFocus = useStore((s) => s.atlasFocus);
  const analyses = useStore((s) => s.analyses);
  const revealed = useStore((s) => s.mechanismRevealed);
  const selectVariant = useStore((s) => s.selectVariant);
  const canvasRef = useRef<AtlasCanvasHandle>(null);
  const [firstMount] = useState(() => !everFocused);
  const [query, setQueryState] = useState(savedQuery);
  const setQuery = useCallback((q: string) => {
    savedQuery = q;
    setQueryState(q);
  }, []);
  const search = useMemo(() => runSearch(index, query), [index, query]);

  const selected = index.idToIdx.get(selectedVariantId) ?? -1;

  // Patient variants whose mechanism is not yet established are drawn without a class colour.
  const hidden = useMemo(() => {
    const h = new Set<number>();
    for (const i of index.patientIdx) if (!mechanismKnown(characterizationStatus(index.variants[i], analyses, revealed))) h.add(i);
    return h;
  }, [index, analyses, revealed]);

  // Focus requests from the store (and the first-ever mount).
  useEffect(() => {
    const nonce = atlasFocus?.nonce ?? 0;
    let pos: number | null = null;
    if (atlasFocus && nonce !== handledNonce) pos = atlasFocus.position;
    else if (firstMount && selected >= 0 && index.variants[selected].patientIds.length) pos = index.pos[selected];
    if (pos === null) return;
    const target = pos;
    // On first mount, show the full landscape briefly, then fly to the residue.
    const t = setTimeout(() => {
      handledNonce = nonce;
      everFocused = true;
      canvasRef.current?.focusResidue(target);
    }, firstMount && !everFocused ? 700 : 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlasFocus?.nonce]);

  const pick = useCallback(
    (i: number) => {
      const v = index.variants[i];
      selectVariant(v.id, { focus: true });
    },
    [index, selectVariant],
  );

  const selectFromCanvas = useCallback((i: number) => selectVariant(index.variants[i].id), [index, selectVariant]);

  const fitTo = useCallback((ext: [number, number] | null) => {
    if (!ext) return;
    const pad = Math.max(4, (ext[1] - ext[0]) * 0.06);
    canvasRef.current?.focusRange(ext[0] - pad, ext[1] + pad, { minSpan: 40 });
  }, []);

  const submit = useCallback(
    (q: string) => {
      setQuery(q);
      const r = runSearch(index, q);
      if (r.matches.length === 1) pick(r.matches[0]);
      else fitTo(r.extent);
    },
    [index, pick, fitTo, setQuery],
  );

  const highlight = useCallback(
    (q: string) => {
      setQuery(q);
      fitTo(runSearch(index, q).extent);
    },
    [index, setQuery, fitTo],
  );

  const status = selected >= 0 ? characterizationStatus(index.variants[selected], analyses, revealed) : 'atlas-record';

  return (
    <Workspace
      keepSidebar
      sidebarWidth={268}
      inspectorWidth={348}
      sidebar={
        <AtlasSidebar
          index={index}
          query={query}
          setQuery={setQuery}
          search={search}
          selected={selected}
          hidden={hidden}
          onPick={pick}
          onFit={() => fitTo(search.extent)}
          onSubmit={submit}
        />
      }
      inspector={selected >= 0 ? <AtlasInspector index={index} i={selected} status={status} onHighlight={highlight} /> : <EmptyState title="No variant selected" detail="Click a record in the landscape or search by ID, position, region or patient." />}
    >
      <AtlasCanvas ref={canvasRef} index={index} mask={search.mask} hidden={hidden} selected={selected} onSelect={selectFromCanvas} />
    </Workspace>
  );
}
