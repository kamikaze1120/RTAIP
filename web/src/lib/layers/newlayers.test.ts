import { describe, expect, it } from "vitest";
import { normalizeAurora } from "./aurora";
import { normalizeCaltrans, normalizeFinland, normalizeHongKong, normalizeNyc, normalizeNz, normalizeSeattle, normalizeSingapore, normalizeTfl, normalizeWindy } from "./cameras";
import { normalizeFeodo } from "./cyber";
import { normalizeGdacs } from "./disasters";
import { normalizeFires } from "./fires";
import { normalizeAdsb } from "./aircraft";
import { normalizeShips, shipTypeLabel } from "./ships";
import { matchZones, portFeatures, zoneFeatures } from "./zones";

const WORLD = { south: -90, west: -180, north: 90, east: 180 };

describe("military aircraft", () => {
  it("tags the layer and keeps registration", () => {
    const out = normalizeAdsb({ ac: [{ hex: "ae64ab", flight: "ICY52 ", lat: 61.2, lon: -149.6, alt_baro: 125, gs: 58, track: 310, squawk: "7700", t: "H60" }] }, WORLD, "test", 1_000_000, "military");
    expect(out.features[0]?.properties.layer).toBe("military");
    expect(out.features[0]?.properties.emergency).toBe(true);
  });
});

describe("ships", () => {
  it("joins vessel metadata and labels the type", () => {
    const meta = new Map([[230356000, { mmsi: 230356000, name: "FINNMAID", shipType: 60, destination: "HELSINKI " }]]);
    const out = normalizeShips({ features: [{ geometry: { coordinates: [21.5, 63.0] }, properties: { mmsi: 230356000, sog: 12.34, cog: 310, navStat: 0, heading: 511, timestampExternal: 1_793_110_268_559 } }, { geometry: { coordinates: [999, 63] }, properties: { mmsi: 1 } }] }, meta);
    expect(out.features).toHaveLength(1);
    const p = out.features[0]?.properties;
    expect(p?.title).toBe("FINNMAID");
    expect(p?.detail).toContain("Passenger ship");
    expect(p?.detail).toContain("to HELSINKI");
    expect(p?.heading).toBe(310);
  });
  it("labels ship types", () => {
    expect(shipTypeLabel(84)).toBe("Tanker");
    expect(shipTypeLabel(undefined)).toBe("Vessel");
  });
});

describe("fires", () => {
  const csv = ["latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight", "10.1,20.2,330.5,0.4,0.4,2026-10-26,0247,N,nominal,2.0NRT,280,55.5,N", "11.1,21.2,300,0.4,0.4,2026-10-26,1302,N,low,2.0NRT,280,1,D", "12.1,22.2,340,0.4,0.4,2026-10-26,1302,N,high,2.0NRT,280,160,D", "999,1,1,1,1,2026-10-26,0000,N,high,2,1,1,D"].join("\n");
  it("drops low confidence and bad rows, sorts by power", () => {
    const out = normalizeFires(csv);
    expect(out.features).toHaveLength(2);
    expect(out.features[0]?.properties.frp).toBe(160);
    expect(out.features[0]?.properties.severity).toBe(1);
    expect(out.features[1]?.properties.time).toBe("2026-10-26T02:47:00.000Z");
  });
  it("returns nothing for an unexpected header", () => {
    expect(normalizeFires("a,b\n1,2").features).toHaveLength(0);
  });
});

describe("gdacs", () => {
  it("keeps points and maps alert level to severity", () => {
    const out = normalizeGdacs({
      features: [
        { geometry: { type: "Point", coordinates: [82.7, 16.3] }, properties: { eventtype: "TC", eventid: 1, name: "Tropical Cyclone ARNAB-26", alertlevel: "Red", country: "India", fromdate: "2026-10-26T00:00:00" } },
        { geometry: { type: "Polygon", coordinates: [] }, properties: { eventtype: "FL", eventid: 2 } },
      ],
    });
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.properties.severity).toBe(0.95);
    expect(out.features[0]?.properties.category).toBe("Tropical cyclone");
  });
});

describe("cameras", () => {
  it("normalizes London cameras and skips unavailable ones", () => {
    const out = normalizeTfl([
      { id: "J1", commonName: "A406 Billet", lat: 51.6, lon: -0.01, additionalProperties: [{ key: "available", value: "true" }, { key: "imageUrl", value: "https://s3.example/1.jpg" }, { key: "view", value: "West" }] },
      { id: "J2", commonName: "Down", lat: 51.5, lon: 0, additionalProperties: [{ key: "available", value: "false" }, { key: "imageUrl", value: "https://s3.example/2.jpg" }] },
    ]);
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.properties.imageUrl).toBe("https://s3.example/1.jpg");
  });
  it("rejects non https images", () => {
    expect(normalizeNyc([{ id: "a", name: "x", latitude: 40, longitude: -73, imageUrl: "http://insecure/x.jpg" }]).features).toHaveLength(0);
    expect(normalizeNyc([{ id: "a", name: "x", latitude: 40, longitude: -73, imageUrl: "https://ok/x.jpg", isOnline: "true" }]).features).toHaveLength(1);
  });
  it("normalizes California and Singapore", () => {
    const cal = normalizeCaltrans([{ cctv: { index: "1", inService: "true", location: { district: "7", locationName: "I-110 at 26th", longitude: "-118.2", latitude: "34.08", route: "I-110" }, imageData: { static: { currentImageURL: "https://cwwp2.dot.ca.gov/a.jpg" } } } }, { cctv: { index: "2", inService: "false", location: { district: "7", locationName: "off", longitude: "-118", latitude: "34" }, imageData: { static: { currentImageURL: "https://x/y.jpg" } } } }]);
    expect(cal.features).toHaveLength(1);
    const sg = normalizeSingapore({ items: [{ cameras: [{ camera_id: "2701", image: "https://images.data.gov.sg/x.jpg", location: { latitude: 1.44, longitude: 103.77 }, timestamp: "2026-10-27T22:15:48+08:00" }] }] });
    expect(sg.features).toHaveLength(1);
    expect(sg.features[0]?.properties.time).toBe("2026-10-27T22:15:48+08:00");
  });
  it("normalizes Finland weather cameras and uses the first collected preset", () => {
    const out = normalizeFinland({
      features: [
        { geometry: { coordinates: [23.99, 60.05, 0] }, properties: { id: "C01503", name: "kt51_Inkoo", presets: [{ id: "C0150301", inCollection: true }, { id: "C0150302", inCollection: true }] } },
        { geometry: { coordinates: [25, 61] }, properties: { id: "C02", name: "no_presets", presets: [] } },
      ],
    });
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.properties.title).toBe("kt51 Inkoo");
    expect(out.features[0]?.properties.imageUrl).toBe("https://weathercam.digitraffic.fi/C0150301.jpg");
    expect(out.features[0]?.geometry).toEqual({ type: "Point", coordinates: [23.99, 60.05] });
  });
  it("parses New Zealand camera XML and skips offline cameras", () => {
    const xml =
      "<response>" +
      "<camera><description>SH1 Tinwald</description><direction>Southbound</direction><highway>SH1</highway><id>714</id><imageUrl>/camera/714.jpg</imageUrl><journey><id>86</id><name>SH1</name><startLatitude>-41.9</startLatitude></journey><latitude>-43.919632</latitude><longitude>171.721055</longitude><name>SH1 Tinwald</name><offline>false</offline><underMaintenance>false</underMaintenance></camera>" +
      "<camera><description>Offline cam</description><id>999</id><imageUrl>/camera/999.jpg</imageUrl><latitude>-40</latitude><longitude>175</longitude><offline>true</offline></camera>" +
      "</response>";
    const out = normalizeNz(xml);
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.id).toBe("newzealand:714");
    expect(out.features[0]?.properties.imageUrl).toBe("https://trafficnz.info/camera/714.jpg");
    expect(out.features[0]?.properties.title).toBe("SH1 Tinwald");
    expect(out.features[0]?.geometry).toEqual({ type: "Point", coordinates: [171.721055, -43.919632] });
  });
  it("normalizes Hong Kong tab-separated camera locations", () => {
    const csv = "key\tregion\tdistrict\tdescription\teasting\tnorthing\tlatitude\tlongitude\turl\nH429F\tHong Kong Island\tSouthern\tAberdeen Praya Road\t833549\t812187\t22.24845\t114.1505\thttps://tdcctv.data.one.gov.hk/H429F.JPG";
    const out = normalizeHongKong(csv);
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.id).toBe("hongkong:H429F");
    expect(out.features[0]?.properties.imageUrl).toBe("https://tdcctv.data.one.gov.hk/H429F.JPG");
    expect(out.features[0]?.geometry).toEqual({ type: "Point", coordinates: [114.1505, 22.24845] });
  });
  it("normalizes Seattle cameras and builds the sdot image URL", () => {
    const out = normalizeSeattle({
      Features: [
        { PointCoordinate: [47.5267, -122.3927], Cameras: [{ Id: "CMR-0112", Description: "Fauntleroy Way SW", ImageUrl: "Fauntleroy.jpg", Type: "sdot" }] },
        { PointCoordinate: [47.6, -122.3], Cameras: [{ Id: "CMR-X", Description: "no image type", ImageUrl: "x.jpg", Type: "wsdot" }] },
      ],
    });
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.properties.imageUrl).toBe("https://www.seattle.gov/trafficcams/images/Fauntleroy.jpg");
    expect(out.features[0]?.geometry).toEqual({ type: "Point", coordinates: [-122.3927, 47.5267] });
  });
  it("normalizes Windy webcams and skips those without an https image", () => {
    const out = normalizeWindy({
      webcams: [
        { webcamId: 12345, title: "Marine Drive", location: { latitude: 18.94, longitude: 72.82, city: "Mumbai", country: "India" }, images: { current: { preview: "https://images.windy.com/webcams/12345/current/preview.jpg" } } },
        { webcamId: 777, title: "No image", location: { latitude: 25.2, longitude: 55.27, city: "Dubai", country: "UAE" }, images: { current: { preview: "http://insecure/x.jpg" } } },
      ],
    });
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.id).toBe("windy:12345");
    expect(out.features[0]?.properties.detail).toBe("Mumbai, India");
    expect(out.features[0]?.geometry).toEqual({ type: "Point", coordinates: [72.82, 18.94] });
  });
});

describe("aurora", () => {
  it("keeps strong cells and wraps longitude", () => {
    const out = normalizeAurora({ "Forecast Time": "2026-10-27T14:00:00Z", coordinates: [[10, 70, 3], [200, 65, 30], [0, 60, 12]] });
    expect(out.features).toHaveLength(2);
    expect(out.features[0]?.geometry).toEqual({ type: "Point", coordinates: [-160, 65] });
  });
});

describe("cyber", () => {
  it("places only servers that were geolocated", () => {
    const list = [
      { ip_address: "1.1.1.1", port: 443, status: "online", malware: "QakBot", as_name: "ASN", country: "US", last_online: "2026-03-12" },
      { ip_address: "2.2.2.2", status: "offline" },
    ];
    const out = normalizeFeodo(list, new Map([["1.1.1.1", { lat: 38.9, lon: -77, city: "Washington" }], ["2.2.2.2", null]]));
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.properties.severity).toBe(0.85);
    expect(out.features[0]?.properties.title).toContain("QakBot");
  });
});

describe("zones and ports", () => {
  it("matches headlines to zones by keyword", () => {
    expect(matchZones("Missile strike reported near Kharkiv").map((z) => z.id)).toEqual(["ukraine"]);
    expect(matchZones("Markets rally on earnings")).toHaveLength(0);
  });
  it("exposes curated points with an honest label", () => {
    expect(zoneFeatures().features.every((f) => f.properties.detail?.includes("not a live measurement"))).toBe(true);
    expect(portFeatures().features.length).toBeGreaterThan(30);
  });
});
