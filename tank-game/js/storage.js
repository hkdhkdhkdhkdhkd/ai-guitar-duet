// 自定义地图本地存储
const STORAGE_KEY = 'tank_battle_custom_maps_v1';

function loadCustomMaps() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveCustomMaps(maps) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
    return true;
  } catch (e) {
    return false;
  }
}

function addCustomMap(map) {
  const maps = loadCustomMaps();
  map.id = 'custom_' + Date.now();
  map.custom = true;
  maps.push(map);
  saveCustomMaps(maps);
  return map;
}

function deleteCustomMap(id) {
  const maps = loadCustomMaps().filter(m => m.id !== id);
  saveCustomMaps(maps);
}

function getAllMaps() {
  const builtins = BUILTIN_MAPS.map((m, i) => ({
    id: 'builtin_' + i,
    name: m.name,
    tag: m.tag || '内置',
    rows: m.rows,
    custom: false
  }));
  return builtins.concat(loadCustomMaps());
}
