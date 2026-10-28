"use client";

import { useMemo } from "react";
import { AIRCRAFT_MIN_ZOOM, POLL_MS } from "./layerConfig";
import type { GeoCollection, GeoFeature } from "./layers/geo";
import type { LayerId } from "./types";
import { usePolling, type PollState } from "./usePolling";

export interface LayerPayload {
  layer: LayerId;
  fetchedAt: string;
  stale: boolean;
  count: number;
  data: GeoCollection;
}

export interface LayerStatus {
  on: boolean;
  loading: boolean;
  error: string | null;
  stale: boolean;
  count: number;
  note?: string;
}

export interface View {
  zoom: number;
  bbox: string | null;
}

const NONE: GeoFeature[] = [];
const url = (on: boolean, id: LayerId, extra = ""): string | null => (on ? `/api/layers/${id}${extra}` : null);

/** One polling hook per data layer. Returns merged features and a status per layer. */
export function useLayers(enabled: ReadonlySet<string>, view: View): { features: Record<LayerId, GeoFeature[]>; status: Record<LayerId, LayerStatus> } {
  const on = (id: string): boolean => enabled.has(id);
  const camsOn = on("cameras");
  const aircraftOn = on("aircraft") && view.zoom >= AIRCRAFT_MIN_ZOOM && view.bbox !== null;

  const quakes = usePolling<LayerPayload>(url(on("quakes"), "quakes"), POLL_MS.quakes);
  const disasters = usePolling<LayerPayload>(url(on("disasters"), "disasters"), POLL_MS.disasters);
  const alerts = usePolling<LayerPayload>(url(on("alerts"), "alerts"), POLL_MS.alerts);
  const aircraft = usePolling<LayerPayload>(aircraftOn ? `/api/layers/aircraft?${view.bbox}` : null, POLL_MS.aircraft);
  const military = usePolling<LayerPayload>(url(on("military"), "military"), POLL_MS.military);
  const ships = usePolling<LayerPayload>(url(on("ships"), "ships"), POLL_MS.ships);
  const fires = usePolling<LayerPayload>(url(on("fires"), "fires"), POLL_MS.fires);
  const aurora = usePolling<LayerPayload>(url(on("aurora"), "aurora"), POLL_MS.aurora);
  const cyber = usePolling<LayerPayload>(url(on("cyber"), "cyber"), POLL_MS.cyber);
  const zones = usePolling<LayerPayload>(url(on("zones"), "zones"), POLL_MS.zones);
  const ports = usePolling<LayerPayload>(url(on("ports"), "ports"), POLL_MS.ports);
  const london = usePolling<LayerPayload>(camsOn ? "/api/layers/cameras?src=london" : null, POLL_MS.cameras);
  const newyork = usePolling<LayerPayload>(camsOn ? "/api/layers/cameras?src=newyork" : null, POLL_MS.cameras);
  const california = usePolling<LayerPayload>(camsOn ? "/api/layers/cameras?src=california" : null, POLL_MS.cameras);
  const singapore = usePolling<LayerPayload>(camsOn ? "/api/layers/cameras?src=singapore" : null, POLL_MS.cameras);
  const newzealand = usePolling<LayerPayload>(camsOn ? "/api/layers/cameras?src=newzealand" : null, POLL_MS.cameras);
  const finland = usePolling<LayerPayload>(camsOn ? "/api/layers/cameras?src=finland" : null, POLL_MS.cameras);
  const hongkong = usePolling<LayerPayload>(camsOn ? "/api/layers/cameras?src=hongkong" : null, POLL_MS.cameras);
  const seattle = usePolling<LayerPayload>(camsOn ? "/api/layers/cameras?src=seattle" : null, POLL_MS.cameras);

  const cameraFeatures = useMemo(
    () => [london, newyork, california, singapore, newzealand, finland, hongkong, seattle].flatMap((s) => s.data?.data.features ?? NONE),
    [london.data, newyork.data, california.data, singapore.data, newzealand.data, finland.data, hongkong.data, seattle.data], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const features = useMemo(
    () => ({
      quakes: quakes.data?.data.features ?? NONE,
      disasters: disasters.data?.data.features ?? NONE,
      alerts: alerts.data?.data.features ?? NONE,
      aircraft: aircraft.data?.data.features ?? NONE,
      military: military.data?.data.features ?? NONE,
      ships: ships.data?.data.features ?? NONE,
      cameras: cameraFeatures,
      fires: fires.data?.data.features ?? NONE,
      aurora: aurora.data?.data.features ?? NONE,
      cyber: cyber.data?.data.features ?? NONE,
      zones: zones.data?.data.features ?? NONE,
      ports: ports.data?.data.features ?? NONE,
    }),
    [quakes.data, disasters.data, alerts.data, aircraft.data, military.data, ships.data, cameraFeatures, fires.data, aurora.data, cyber.data, zones.data, ports.data],
  );

  const st = (id: LayerId, s: PollState<LayerPayload>, extra: Partial<LayerStatus> = {}): LayerStatus => ({
    on: on(id),
    loading: on(id) && s.loading && !s.data,
    error: on(id) ? s.error : null,
    stale: Boolean(s.data?.stale),
    count: features[id].length,
    ...extra,
  });

  const camStates = [london, newyork, california, singapore, newzealand, finland, hongkong, seattle];
  const status: Record<LayerId, LayerStatus> = {
    quakes: st("quakes", quakes),
    disasters: st("disasters", disasters),
    alerts: st("alerts", alerts),
    aircraft: st("aircraft", aircraft, { note: on("aircraft") && !aircraftOn ? "Zoom in to load" : undefined, loading: aircraftOn && aircraft.loading && !aircraft.data }),
    military: st("military", military),
    ships: st("ships", ships),
    cameras: {
      on: camsOn,
      loading: camsOn && camStates.every((s) => s.loading),
      error: camsOn && camStates.every((s) => s.error) ? (london.error ?? "unavailable") : null,
      stale: camStates.some((s) => s.data?.stale),
      count: cameraFeatures.length,
    },
    fires: st("fires", fires),
    aurora: st("aurora", aurora),
    cyber: st("cyber", cyber),
    zones: st("zones", zones),
    ports: st("ports", ports),
  };

  return { features, status };
}
