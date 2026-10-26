import { certsTransform } from "./certs";
import { dnsTransform } from "./dns";
import { emailTransform } from "./email";
import { ipGeoTransform } from "./ipgeo";
import { rdapTransform } from "./rdap";
import type { Transform } from "./types";

export const TRANSFORMS: Transform[] = [emailTransform, dnsTransform, rdapTransform, certsTransform, ipGeoTransform];

export function transformsFor(type: string): Transform[] {
  return TRANSFORMS.filter((t) => t.accepts.includes(type as never));
}
