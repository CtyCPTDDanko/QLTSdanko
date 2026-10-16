/**
 * Parses a location string and normalizes it to "City-Project-Location" format.
 * Maps shorthand accentless names like "Mat truoc C6-I" to standard accented formats.
 */
export function parseAndNormalizeLocation(location: string | null | undefined): {
  city: string;
  project: string;
  location: string;
  fullFormatted: string;
} {
  if (!location) {
    return { city: '', project: '', location: '', fullFormatted: '' };
  }

  const trimmed = normalizeAssetLocation(location);

  // Preserve every selected level for structured locations before applying the
  // legacy shorthand rules below. Those rules intentionally collapse values
  // such as "Mặt trước C6-I", but must not discard the place/floor/detail
  // levels appended by the location picker.
  const structuredParts = trimmed
    .split(/\s+(?:-|\/)\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (structuredParts.length > 3) {
    const city = structuredParts[0];
    const project = normalizeProjectName(structuredParts[1]);
    const detail = structuredParts.slice(2).join(' / ');
    return {
      city,
      project,
      location: detail,
      fullFormatted: `${city} - ${project} - ${detail}`
    };
  }

  // Strip accents and clean up spaces/dashes for mapping checks
  const lower = trimmed.toLowerCase();
  const cleanStr = stripAccents(lower)
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Shorthand rule checks
  if (/\bmat truoc c6 (?:ii|2)\b/.test(cleanStr)) {
    return {
      city: 'Hà Nội',
      project: 'Văn phòng C6',
      location: 'Mặt trước C6-II',
      fullFormatted: 'Hà Nội - Văn phòng C6 - Mặt trước C6-II'
    };
  }

  if (/\bmat truoc c6 (?:i|1)\b/.test(cleanStr)) {
    return {
      city: 'Hà Nội',
      project: 'Văn phòng C6',
      location: 'Mặt trước C6-I',
      fullFormatted: 'Hà Nội - Văn phòng C6 - Mặt trước C6-I'
    };
  }

  if (/\bmat sau c6 (?:ii|2)\b/.test(cleanStr)) {
    return {
      city: 'Hà Nội',
      project: 'Văn phòng C6',
      location: 'Mặt sau C6-II',
      fullFormatted: 'Hà Nội - Văn phòng C6 - Mặt sau C6-II'
    };
  }

  if (/\bmat sau c6 (?:i|1)\b/.test(cleanStr)) {
    return {
      city: 'Hà Nội',
      project: 'Văn phòng C6',
      location: 'Mặt sau C6-I',
      fullFormatted: 'Hà Nội - Văn phòng C6 - Mặt sau C6-I'
    };
  }

  if (cleanStr.includes('tang 9 c6 i') || cleanStr.includes('tang 9 c6 1')) {
    return {
      city: 'Hà Nội',
      project: 'Văn phòng C6',
      location: 'Tầng 9 C6-I',
      fullFormatted: 'Hà Nội - Văn phòng C6 - Tầng 9 C6-I'
    };
  }

  // Parsing formats like "City - Project - Location" or "City / Project / Location" or "City-Project-Location"
  const parts = structuredParts;
  if (parts.length >= 3) {
    const city = parts[0];
    const project = parts[1];
    const loc = parts.slice(2).join('-');
    return {
      city,
      project,
      location: loc,
      fullFormatted: `${city} - ${normalizeProjectName(project)} - ${loc}`
    };
  } else if (parts.length === 2) {
    const city = parts[0];
    const loc = parts[1];
    return {
      city,
      project: '',
      location: loc,
      fullFormatted: `${city} - ${loc}`
    };
  }

  return {
    city: '',
    project: '',
    location: trimmed,
    fullFormatted: trimmed
  };
}

export function normalizeAssetUnit(unit: string | null | undefined): string {
  const value = String(unit || '').trim();
  if (value === 'B?') return 'Bộ';
  if (value === 'Chi?c') return 'Chiếc';
  return value || 'Cái';
}

export function normalizeProjectName(project: string | null | undefined): string {
  const value = String(project || '').trim();
  if (value === 'Du an khac' || value === 'Du án khác') return 'Dự án khác';
  if (stripAccents(value).toLowerCase() === 'van phong ha noi') return 'Văn phòng C6';
  return value;
}

export function normalizeLocationLabel(location: string): string {
  return location
    .replace(/Mat sau C6-I/gi, 'Mặt sau C6-I')
    .replace(/Mat truoc C6-I/gi, 'Mặt trước C6-I')
    .replace(/Tang 9 C6-I/gi, 'Tầng 9 C6-I')
    .replace(/Khối\s+II\b/gi, 'C6-II')
    .replace(/Khối\s+I\b/gi, 'C6-I');
}

export function normalizeLocationSeparators(location: string): string {
  const value = String(location || '').trim();
  if (!value.includes('-')) return value;

  return value
    .replace(/\b([A-Za-z]+\d+)\s*-\s*([IVXLCDM]+|\d+)(?=$|[\s,.;)\-])/gi, '$1§$2')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/§/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLocationPartPrefix(value: string, prefix: string): string {
  const cleanValue = String(value || '').trim();
  const cleanPrefix = String(prefix || '').trim();
  if (!cleanPrefix) return cleanValue;

  const escapedPrefix = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cleanValue
    .replace(new RegExp(`^${escapedPrefix}(?:\\s*(?:-|/)\\s*|$)`, 'i'), '')
    .trim();
}

function formatLocationHierarchy(city: string, project: string, location: string): string {
  let detail = stripLocationPartPrefix(location, city);
  detail = stripLocationPartPrefix(detail, project);
  return [city, project, detail].filter(Boolean).join(' - ');
}

export function normalizeDepartmentName(
  departmentName: string | null | undefined,
  cityName?: string | null,
  projectName?: string | null
): string {
  const value = String(departmentName || '').trim();
  const normalized = stripAccents(value).toLowerCase().replace(/\s+/g, ' ').trim();
  const standardDepartmentNames: Record<string, string> = {
    'b. ktxd': 'B. Kinh tế Xây dựng',
    'b. kinh te xay dung': 'B. Kinh tế Xây dựng',
    'b. qltk': 'B. Quản lý Thiết kế',
    'b. quan ly thiet ke': 'B. Quản lý Thiết kế',
    'b. qlxd': 'B. Quản lý Xây dựng',
    'b. quan ly xay dung': 'B. Quản lý Xây dựng',
    'b. tltk': 'B. Trợ lý - Thư ký',
    'b. tro ly - thu ky': 'B. Trợ lý - Thư ký',
    'bld': 'Ban Lãnh đạo',
    'ban lanh dao': 'Ban Lãnh đạo',
    'b. hcns': 'B. Hành chính Nhân sự',
    'hcns': 'B. Hành chính Nhân sự',
    'hanh chinh nhan su': 'B. Hành chính Nhân sự',
    'ban hanh chinh nhan su': 'B. Hành chính Nhân sự',
    'b. hanh chinh nhan su': 'B. Hành chính Nhân sự',
    'bqlvh dkc': 'B. Quản lý Vận hành Danko City',
    'b. quan ly van hanh danko city': 'B. Quản lý Vận hành Danko City',
    'bqlda dkc': 'B. Quản lý Dự án Danko City',
    'b. quan ly du an danko city': 'B. Quản lý Dự án Danko City'
  };
  const standardName = standardDepartmentNames[normalized];
  if (standardName) return standardName;

  const city = stripAccents(String(cityName || '')).toLowerCase().trim();
  const project = stripAccents(String(projectName || '')).toLowerCase().trim();
  const isCenterContext = city === 'tuyen quang'
    || project === 'danko center'
    || ['bqlda dkt', 'van phong ban hang kim phu', 'vpbh dkt'].includes(normalized);

  if (!isCenterContext) return value;
  if (['b. cay xanh', 'ban cay xanh'].includes(normalized)) return 'B. Cây Xanh';
  if (['bqlda dkt', 'ban quan ly du an'].includes(normalized)) return 'Ban Quản lý Dự án';
  if (['kinh doanh', 'b. kinh doanh'].includes(normalized)) return 'B. Kinh doanh';
  if (['van phong ban hang kim phu', 'vpbh dkt', 'van phong ban hang'].includes(normalized)) {
    return 'Văn phòng bán hàng';
  }
  return value;
}

export function normalizeAssetLocation(
  location: string | null | undefined,
  cityName?: string | null,
  projectName?: string | null,
  departmentName?: string | null
): string {
  const city = String(cityName || '').trim();
  const project = normalizeProjectName(projectName);
  const department = String(departmentName || '').trim();
  let value = normalizeLocationSeparators(
    normalizeLocationLabel(String(location || '').trim())
      .replace(/Văn phòng Hà Nội/gi, 'Văn phòng C6')
  );

  const normalizedCity = stripAccents(city).toLowerCase();
  const normalizedProject = stripAccents(project).toLowerCase();
  const normalizedDepartment = stripAccents(department).toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedValue = stripAccents(value).toLowerCase();
  const compactValue = normalizedValue
    .replace(/[-/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const riversideOfficeAliases = new Set([
    'danko riverside',
    'van phong ban hang danko riverside',
    'van phong bac ninh',
    'van phong ban hang',
    'bac ninh danko riverside van phong ban hang'
  ]);
  const belongsToRiverside = normalizedCity === 'bac ninh'
    && normalizedProject === 'danko riverside';

  if (
    riversideOfficeAliases.has(compactValue)
    && (belongsToRiverside || compactValue !== 'van phong ban hang')
  ) {
    return 'Bắc Ninh - Danko Riverside - Văn phòng Bán hàng';
  }

  const centerDepartmentLocations: Record<string, string> = {
    'b. cay xanh': 'B. Cây Xanh',
    'ban cay xanh': 'B. Cây Xanh',
    'bqlda dkt': 'Ban Quản lý Dự án',
    'ban quan ly du an': 'Ban Quản lý Dự án',
    'kinh doanh': 'B. Kinh doanh',
    'kinh doạnh': 'B. Kinh doanh',
    'b. kinh doanh': 'B. Kinh doanh',
    'van phong ban hang kim phu': 'Văn phòng bán hàng',
    'vpbh dkt': 'Văn phòng bán hàng',
    'van phong ban hang': 'Văn phòng bán hàng'
  };
  const centerDepartmentLocation = centerDepartmentLocations[normalizedDepartment];
  const belongsToCenter = normalizedCity === 'tuyen quang'
    || normalizedProject === 'danko center'
    || compactValue === 'danko center'
    || compactValue.startsWith('tuyen quang danko center')
    || ['bqlda dkt', 'van phong ban hang kim phu', 'vpbh dkt'].includes(normalizedDepartment);
  const isGenericCenterLocation = !compactValue
    || compactValue === 'danko center'
    || compactValue === 'tuyen quang danko center van phong ban hang';

  if (belongsToCenter && centerDepartmentLocation && isGenericCenterLocation) {
    return `Tuyên Quang - Danko Center - ${centerDepartmentLocation}`;
  }
  if (compactValue === 'danko center' || compactValue === 'tuyen quang danko center van phong ban hang') {
    return 'Tuyên Quang - Danko Center - Văn phòng bán hàng';
  }

  const alreadyHasHanoiPrefix = /^ha noi(?:\s*-\s*|\s*\/\s*|$)/.test(normalizedValue);
  const belongsToHanoi = normalizedCity === 'ha noi'
    || normalizedProject === 'van phong c6'
    || normalizedProject === 'van phong ha noi'
    || normalizedValue.includes('van phong c6')
    || /\bc6(?:\s*-\s*[i1]+)?\b/.test(normalizedValue);

  // Existing Hà Nội-prefixed values are kept intact, except for the office rename above.
  if (alreadyHasHanoiPrefix) return value;
  if (!belongsToHanoi) return formatLocationHierarchy(city, project, value);

  value = value
    .replace(/^Văn phòng C6\s*(?:-\s*|\/\s*)?/i, '')
    .trim();

  return value
    ? `Hà Nội - Văn phòng C6 - ${value}`
    : 'Hà Nội - Văn phòng C6';
}

function stripAccents(str: string): string {
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
