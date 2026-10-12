// Base areas with approximate centre coordinates, used for "nearest doctor" search.
export interface Area {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export const AREAS: Area[] = [
  { id: 'chiyoda', name: '東京都千代田区', lat: 35.694, lng: 139.7536 },
  { id: 'chuo', name: '東京都中央区', lat: 35.6707, lng: 139.772 },
  { id: 'minato', name: '東京都港区', lat: 35.6581, lng: 139.7516 },
  { id: 'shinjuku', name: '東京都新宿区', lat: 35.6938, lng: 139.7034 },
  { id: 'bunkyo', name: '東京都文京区', lat: 35.7081, lng: 139.7522 },
  { id: 'taito', name: '東京都台東区', lat: 35.7126, lng: 139.78 },
  { id: 'sumida', name: '東京都墨田区', lat: 35.7107, lng: 139.8015 },
  { id: 'koto', name: '東京都江東区', lat: 35.6728, lng: 139.8173 },
  { id: 'shinagawa', name: '東京都品川区', lat: 35.6092, lng: 139.7302 },
  { id: 'meguro', name: '東京都目黒区', lat: 35.6413, lng: 139.6982 },
  { id: 'ota', name: '東京都大田区', lat: 35.5613, lng: 139.716 },
  { id: 'setagaya', name: '東京都世田谷区', lat: 35.6464, lng: 139.6532 },
  { id: 'shibuya', name: '東京都渋谷区', lat: 35.6639, lng: 139.6977 },
  { id: 'nakano', name: '東京都中野区', lat: 35.7074, lng: 139.6638 },
  { id: 'suginami', name: '東京都杉並区', lat: 35.6995, lng: 139.6364 },
  { id: 'toshima', name: '東京都豊島区', lat: 35.7263, lng: 139.7165 },
  { id: 'kita', name: '東京都北区', lat: 35.7528, lng: 139.7336 },
  { id: 'arakawa', name: '東京都荒川区', lat: 35.7361, lng: 139.7834 },
  { id: 'itabashi', name: '東京都板橋区', lat: 35.7512, lng: 139.7093 },
  { id: 'nerima', name: '東京都練馬区', lat: 35.7356, lng: 139.6517 },
  { id: 'adachi', name: '東京都足立区', lat: 35.7751, lng: 139.8044 },
  { id: 'katsushika', name: '東京都葛飾区', lat: 35.7434, lng: 139.8473 },
  { id: 'edogawa', name: '東京都江戸川区', lat: 35.7068, lng: 139.8683 },
  { id: 'musashino', name: '東京都武蔵野市', lat: 35.7178, lng: 139.5661 },
  { id: 'mitaka', name: '東京都三鷹市', lat: 35.6835, lng: 139.5596 },
  { id: 'chofu', name: '東京都調布市', lat: 35.6506, lng: 139.5407 },
  { id: 'fuchu', name: '東京都府中市', lat: 35.6689, lng: 139.4776 },
  { id: 'tachikawa', name: '東京都立川市', lat: 35.6939, lng: 139.4077 },
  { id: 'hachioji', name: '東京都八王子市', lat: 35.6664, lng: 139.316 },
  { id: 'machida', name: '東京都町田市', lat: 35.5466, lng: 139.4386 },
  { id: 'kawasaki', name: '神奈川県川崎市', lat: 35.5308, lng: 139.703 },
  { id: 'yokohama', name: '神奈川県横浜市', lat: 35.4437, lng: 139.638 },
  { id: 'saitama', name: '埼玉県さいたま市', lat: 35.8617, lng: 139.6455 },
  { id: 'chiba', name: '千葉県千葉市', lat: 35.6073, lng: 140.1063 },
];

export const areaName = (id: string) => AREAS.find((a) => a.id === id)?.name ?? '未設定';

export function distanceKm(a: string, b: string): number | null {
  const p = AREAS.find((x) => x.id === a);
  const q = AREAS.find((x) => x.id === b);
  if (!p || !q) return null;
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(q.lat - p.lat);
  const dLng = rad(q.lng - p.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
