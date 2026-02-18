const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "").replace(/^\[/, "").replace(/\]$/, "");
}

export function normalizeHostnameAllowlist(values?: string[]): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  return [
    ...new Set(
      values
        .map((value) => normalizeHostname(value))
        .filter((value) => value && value !== "*" && value !== "*."),
    ),
  ];
}

function isHostnameAllowedByPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    if (!suffix || hostname === suffix) {
      return false;
    }
    return hostname.endsWith(`.${suffix}`);
  }
  return hostname === pattern;
}

export function matchesHostnameAllowlist(hostname: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return true;
  }

  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return false;
  }

  return allowlist.some((pattern) => isHostnameAllowedByPattern(normalized, pattern));
}

export function isUrlAllowedByAllowlist(url: string, allowlist: string[]): boolean {
  try {
    const hostname = new URL(url).hostname;
    return matchesHostnameAllowlist(hostname, allowlist);
  } catch {
    return false;
  }
}

export function resolveUrlAllowlist(raw: string | undefined): string[] | undefined {
  if (!raw) {
    return undefined;
  }

  const allowlist = raw
    .split(/[,\n\r\t]+/)
    .map((value) => value.trim())
    .filter((value) => Boolean(value));

  const normalized = normalizeHostnameAllowlist(allowlist);
  return normalized.length > 0 ? normalized : undefined;
}

export function isDisallowedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return false;
  }
  if (BLOCKED_HOSTNAMES.has(normalized)) {
    return true;
  }
  return (
    normalized === "local" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

export function filterResultsByAllowlist<
  T extends {
    url?: string;
  },
>(results: T[], allowlist: string[]): T[] {
  if (allowlist.length === 0) {
    return results;
  }

  return results.filter((result) => {
    if (!result.url) {
      return true;
    }
    return isUrlAllowedByAllowlist(result.url, allowlist);
  });
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const numbers = parts.map((part) => Number.parseInt(part, 10));
  if (numbers.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return null;
  }
  return numbers;
}

function stripIpv6ZoneId(address: string): string {
  const index = address.indexOf("%");
  return index >= 0 ? address.slice(0, index) : address;
}

type Ipv6Hextets = [number, number, number, number, number, number, number, number];

function parseIpv6Hextets(address: string): Ipv6Hextets | null {
  let input = stripIpv6ZoneId(address.trim().toLowerCase());
  if (!input) {
    return null;
  }

  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    if (lastColon < 0) {
      return null;
    }
    const ipv4 = parseIpv4(input.slice(lastColon + 1));
    if (!ipv4 || ipv4.length !== 4) {
      return null;
    }
    const [ipv4High, ipv4Low, ipv4Third, ipv4Fourth] = ipv4;
    if (
      ipv4High === undefined ||
      ipv4Low === undefined ||
      ipv4Third === undefined ||
      ipv4Fourth === undefined
    ) {
      return null;
    }
    const high = (ipv4High << 8) + ipv4Low;
    const low = (ipv4Third << 8) + ipv4Fourth;
    input = `${input.slice(0, lastColon)}:${high.toString(16)}:${low.toString(16)}`;
  }

  const doubleColonParts = input.split("::");
  if (doubleColonParts.length > 2) {
    return null;
  }

  const [head = "", tail = ""] = doubleColonParts;
  const headParts = head.length > 0 ? head.split(":").filter(Boolean) : [];
  const tailParts =
    doubleColonParts.length === 2 && tail.length > 0 ? tail.split(":").filter(Boolean) : [];

  const missingParts = 8 - headParts.length - tailParts.length;
  if (missingParts < 0) {
    return null;
  }

  const fullParts =
    doubleColonParts.length === 1
      ? input.split(":")
      : [...headParts, ...Array.from({ length: missingParts }, () => "0"), ...tailParts];

  if (fullParts.length !== 8) {
    return null;
  }

  const hextets: number[] = [];
  for (const part of fullParts) {
    if (!part) {
      return null;
    }
    const value = Number.parseInt(part, 16);
    if (Number.isNaN(value) || value < 0 || value > 0xffff) {
      return null;
    }
    hextets.push(value);
  }
  return hextets as Ipv6Hextets;
}

function decodeIpv4FromHextets(high: number, low: number): number[] {
  return [(high >>> 8) & 0xff, high & 0xff, (low >>> 8) & 0xff, low & 0xff];
}

type EmbeddedIpv4Rule = {
  matches: (hextets: Ipv6Hextets) => boolean;
  extract: (hextets: Ipv6Hextets) => [high: number, low: number];
};

const EMBEDDED_IPV4_RULES: EmbeddedIpv4Rule[] = [
  {
    matches: (hextets) =>
      hextets[0] === 0 &&
      hextets[1] === 0 &&
      hextets[2] === 0 &&
      hextets[3] === 0 &&
      hextets[4] === 0 &&
      (hextets[5] === 0xffff || hextets[5] === 0),
    extract: (hextets) => [hextets[6], hextets[7]],
  },
  {
    matches: (hextets) =>
      hextets[0] === 0x64 &&
      hextets[1] === 0xff9b &&
      hextets[2] === 0 &&
      hextets[3] === 0 &&
      hextets[4] === 0 &&
      hextets[5] === 0,
    extract: (hextets) => [hextets[6], hextets[7]],
  },
  {
    matches: (hextets) =>
      hextets[0] === 0x64 &&
      hextets[1] === 0xff9b &&
      hextets[2] === 1 &&
      hextets[3] === 0 &&
      hextets[4] === 0 &&
      hextets[5] === 0,
    extract: (hextets) => [hextets[6], hextets[7]],
  },
  {
    matches: (hextets) => hextets[0] === 0x2002,
    extract: (hextets) => [hextets[1], hextets[2]],
  },
  {
    matches: (hextets) => hextets[0] === 0x2001 && hextets[1] === 0,
    extract: (hextets) => [hextets[6] ^ 0xffff, hextets[7] ^ 0xffff],
  },
];

function extractIpv4FromEmbeddedIpv6(hextets: Ipv6Hextets): number[] | null {
  for (const rule of EMBEDDED_IPV4_RULES) {
    if (!rule.matches(hextets)) {
      continue;
    }
    const [high, low] = rule.extract(hextets);
    return decodeIpv4FromHextets(high, low);
  }
  return null;
}

function isPrivateIpv4(parts: number[]): boolean {
  const [octet1, octet2] = parts;
  if (octet1 === undefined || octet2 === undefined) {
    return false;
  }

  if (octet1 === 0 || octet1 === 10 || octet1 === 127 || octet1 === 255) {
    return true;
  }
  if (octet1 === 169 && octet2 === 254) {
    return true;
  }
  if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
    return true;
  }
  if (octet1 === 192 && octet2 === 168) {
    return true;
  }
  if (octet1 === 100 && octet2 >= 64 && octet2 <= 127) {
    return true;
  }
  return false;
}

export function isPrivateIpAddress(address: string): boolean {
  let normalized = address.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }

  if (normalized.includes(":")) {
    const hextets = parseIpv6Hextets(normalized);
    if (!hextets) {
      return true;
    }

    const isUnspecified = hextets.every((part) => part === 0);
    const isLoopback =
      hextets[0] === 0 &&
      hextets[1] === 0 &&
      hextets[2] === 0 &&
      hextets[3] === 0 &&
      hextets[4] === 0 &&
      hextets[5] === 0 &&
      hextets[6] === 0 &&
      hextets[7] === 1;
    if (isUnspecified || isLoopback) {
      return true;
    }

    const embeddedIpv4 = extractIpv4FromEmbeddedIpv6(hextets);
    if (embeddedIpv4) {
      return isPrivateIpv4(embeddedIpv4);
    }

    const [first] = hextets;
    if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0 || (first & 0xfe00) === 0xfc00) {
      return true;
    }

    return false;
  }

  const ipv4 = parseIpv4(normalized);
  if (!ipv4) {
    return false;
  }
  return isPrivateIpv4(ipv4);
}
