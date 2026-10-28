import { certsTransform } from "./certs";
import { dnsTransform } from "./dns";
import { emailTransform } from "./email";
import { gdeltTransform } from "./gdelt";
import { ipGeoTransform } from "./ipgeo";
import { rdapTransform } from "./rdap";
import { sanctionsTransform } from "./sanctions";
import type { Transform } from "./types";

export const TRANSFORMS: Transform[] = [emailTransform, dnsTransform, rdapTransform, certsTransform, ipGeoTransform, sanctionsTransform, gdeltTransform];

export function transformsFor(type: string): Transform[] {
  return TRANSFORMS.filter((t) => t.accepts.includes(type as never));
}
