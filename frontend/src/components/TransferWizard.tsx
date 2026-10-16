import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Check, Search, Plus, Trash2, Package, MapPin, 
  User, Building, ShieldAlert, ChevronLeft, ChevronRight, 
  Printer, Save, CheckCircle2, History, AlertTriangle,
  ArrowRightLeft, RotateCcw, ChevronDown, Edit3
} from 'lucide-react';
import api from '../lib/api';
import { toast } from 'react-toastify';
import { BaseModal } from './BaseModal';
import { useAuth } from '../context/AuthContext';

const normalizeSearchText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd')
  .toLocaleLowerCase('vi')
  .trim();

export const LOCATION_HIERARCHY: Record<string, Record<string, string[]>> = {
  'Hà Nội': {
    'Văn phòng C6': [
      'Mặt trước C6-I',
      'Mặt sau C6-I',
      'Kho',
      'Mặt trước C6-II',
      'Mặt sau C6-II',
      'Tầng 9 C6-I',
      'Tầng 2 C6-II'
    ],
    'Vân Canh': ['Kho']
  },
  'Thái Nguyên': {
    'Danko City': ['Trung tâm thương mại', 'Văn phòng BQLDA', 'Kho'],
    'Danko Avenue': ['Văn phòng Bán hàng', 'Văn phòng BQLDA', 'Kho'],
    'Danko Sun River': ['Văn phòng Bán hàng', 'Văn phòng BQLDA', 'Kho']
  },
  'Bắc Ninh': {
    'Danko Riverside': ['Văn phòng Bán hàng', 'Văn phòng BQLDA', 'Kho']
  },
  'Tuyên Quang': {
    'Danko Center': ['Văn phòng Bán hàng', 'Văn phòng BQLDA', 'Kho']
  },
  'Thanh Hóa': {
    'Danko Royal': ['Văn phòng Bán hàng', 'Văn phòng BQLDA', 'Kho'],
    'Danko The Country': ['Văn phòng Bán hàng', 'Văn phòng BQLDA', 'Kho']
  },
  'Phú Thọ': {
    'Dự án chưa hình thành': ['Văn phòng BQLDA', 'Kho']
  },
  'Hà Nam': {
    'Dự án chưa hình thành': ['Văn phòng BQLDA', 'Kho']
  }
};

export interface LocationTree {
  [key: string]: LocationTree | null;
}

const HANOI_C6_LOCATION_TREE: LocationTree = {
  'Mặt trước C6-I': null,
  'Mặt sau C6-I': null,
  'Kho': null,
  'Mặt trước C6-II': null,
  'Mặt sau C6-II': null,
  'Tầng 9 C6-I': null,
  'Tầng 2 C6-II': null
};

const HANOI_VAN_CANH_LOCATION_TREE: LocationTree = {
  'Kho': null
};

const DANKO_CITY_LOCATION_TREE: LocationTree = {
  'Ban Quản lý dự án': null,
  'Ban Cây Xanh': null,
  'KHU CỔNG CHÀO': {
    'Cổng chính Khu đô thị': {
      'Phòng bảo vệ': null,
      'Phòng Server': null
    },
    'Quảng trường Ánh sáng The Light': null,
    'Cổng phụ dự án': {
      'Phòng bảo vệ': null
    }
  },
  'KHU ĐẠI LỘ': {
    'Đại lộ Champs Elysees': null
  },
  'KHU TRUNG TÂM': {
    'Trung tâm thương mại Danko Plaza': {
      'Tầng hầm': {
        'Phòng bảo vệ': null,
        'Phòng kho': null,
        'Khu để xe': null
      },
      'Tầng 1': {
        'Sảnh giữa': null,
        'Sảnh trái': null,
        'Sảnh phải': null,
        'WC': null
      },
      'Tầng 2': {
        'Khu vực sảnh': null,
        'WC': null
      },
      'Tầng 3': {
        'Khu vực sảnh': null,
        'WC': null
      },
      'Tầng 4': {
        'Khu vực sảnh': null,
        'WC': null,
        'Phòng Khánh tiết': null,
        'Phòng nghỉ VIP 1': null,
        'Phòng nghỉ VIP 2': null,
        'Phòng làm việc 1': null,
        'Phòng làm việc 2': null,
        'Phòng làm việc 3': null,
        'Pantry': null,
        'Phòng Thủ tục & Chăm sóc khách hàng': null,
        'Phòng họp VIP 1': null,
        'Phòng họp VIP 2': null
      },
      'Tầng 5': {
        'Phòng tiệc': null,
        'Tầng lửng tiệc': null,
        'Khu bếp': null,
        'Kho bếp': null,
        'WC': null
      },
      'Tầng 6': {
        'Khu bếp': null
      },
      'Tầng 7': {
        'Phòng kỹ thuật': null
      }
    },
    'Quảng trường Victoria': null,
    'Phố đi bộ The Rome': null,
    'Sân khấu nhạc nước The Harmony': {
      'Khu kỹ thuật ngầm': null
    },
    'Cầu Lion Bridge': null
  },
  'PHÂN KHU KING ISLAND': {
    'Tiểu khu Đảo Vua (King Island)': null
  },
  'PHÂN KHU PARK ROYAL': {
    'Tiểu khu Park Royal': null,
    'Discovery Land': null,
    'Bể bơi Resort': {
      'Tầng hầm': null,
      'Tầng 1': {
        'Bể bơi': null,
        'WC': null
      },
      'Tầng 2': {
        'Khu ngoài trời': null,
        'WC': null
      }
    },
    'Vườn Tùng Tháp': null,
    'Sân thể thao đa năng': null
  },
  'KHU HỒ MẮT RỒNG': {
    'Công viên Hồ Mắt Rồng': null,
    'Bến du thuyền Monaco': null,
    'Khu vui chơi trẻ em': null,
    'Khu vui chơi ngoài trời': null,
    'Babylon Garden': null,
    'Cầu Melody': null,
    'Chòi nghỉ bên hồ': null,
    'Đường dạo bộ quanh hồ': null
  }
};

const DANKO_RIVERSIDE_LOCATION_TREE: LocationTree = {
  'Ban Quản lý dự án': null,
  'Ban Cây Xanh': null,
  'KHU CỔNG CHÀO': {
    'Cổng chào Golden Gate': null
  },
  'PHÂN KHU MAJESTIC': {
    'Văn phòng bán hàng': {
      'Phòng họp': null,
      'Sảnh khánh tiết': null
    },
    'Quảng trường Danko': null,
    'Tháp biểu tượng The Pride': null,
    'Bể bơi Lavish': null,
    'Vườn Ý - Florence Garden': null,
    'Sân thể thao Athens': null,
    'Vườn Thụy Sĩ - The Vow Garden': null
  },
  'PHÂN KHU THE MUSE': {
    'Vườn Pháp - Versailles Garden': null,
    'Suối Hà Lan': null,
    'Khu nhà ở': null
  },
  'PHÂN KHU THE SUMMIT': {
    'Khu nhà ở': null,
    'Trạm Y tế': null,
    'Công viên cảnh quan': null
  },
  'KHU CHUNG CƯ': {
    'Chung cư The Summit': {
      'Tòa A': null,
      'Tòa B': null
    }
  },
  'KHU GIÁO DỤC': {
    'Trường THPT': null,
    'Trường Liên cấp': null,
    'Trường Mầm non': null
  },
  'KHU THƯƠNG MẠI - DỊCH VỤ': {
    'Đất thương mại dịch vụ': null
  }
};

const DANKO_CENTER_LOCATION_TREE: LocationTree = {
  'Ban Quản lý dự án': null,
  'Ban Cây Xanh': null,
  'KHU CỔNG CHÀO': {
    'Cổng chào Victory': null
  },
  'KHU ĐẠI LỘ': {
    'Đại lộ Galaxy': null
  },
  'PHÂN KHU AURORA': {
    'Shop thương mại': null,
    'Trường Liên cấp Tiểu học - Trung học cơ sở': null,
    "Phố đi bộ Hermes's Blessing": null,
    'Văn phòng bán hàng': {
      'Sảnh khánh tiết': null,
      'Phòng họp': null,
      'Phòng làm việc': null,
      'Phòng tiếp khách': null,
      'Pantry': null,
      'WC': null,
      'Phòng kỹ thuật': null
    },
    'Khu nhà ở Aurora': null
  },
  'PHÂN KHU HELIOS': {
    'Tháp biểu tượng Helios': null,
    'Quảng trường Sun Square': null,
    'Bể bơi Sunset': null,
    'Công viên Moonlight': null,
    'Hồ Moonlight': null,
    'Khu nhà ở Helios': null
  },
  'PHÂN KHU SELENE': {
    'Công viên cảnh quan': null,
    'Trường Mầm non Quốc tế': null,
    'Khu nhà ở Selene': null
  },
  'KHU GIÁO DỤC': {
    'Trường Liên cấp Tiểu học - Trung học cơ sở': null,
    'Trường Mầm non Quốc tế': null
  },
  'KHU THƯƠNG MẠI': {
    'Shop thương mại': null
  },
  'KHU CÔNG VIÊN - CẢNH QUAN': {
    'Công viên Moonlight': null,
    'Hồ Moonlight': null,
    'Công viên cảnh quan': null,
    'Quảng trường Sun Square': null,
    'Bể bơi Sunset': null,
    "Phố đi bộ Hermes's Blessing": null,
    'Tháp biểu tượng Helios': null
  }
};

const DANKO_THE_COUNTRY_LOCATION_TREE: LocationTree = {
  'KHU ĐIỀU HÀNH': {
    'Văn phòng Bán hàng': { 'Khu văn phòng': { 'Khu vực sử dụng chung': null } },
    'Văn phòng BQLDA': { 'Khu văn phòng': { 'Khu vực sử dụng chung': null } },
    'Kho': { 'Khu kho': { 'Khu vực lưu trữ chung': null } }
  },
  'KHU CỔNG CHÀO': {
    'Cổng chào The Heritage Gate': { 'Khu vực cổng chào': { 'Toàn bộ cổng chào': null } }
  },
  'KHU QUẢNG TRƯỜNG - BIỂU TƯỢNG': {
    'Quảng trường Elysium Square': { 'Khu vực quảng trường': { 'Khu vực ngoài trời': null } },
    'Tháp biểu tượng The Royal Pavilion': { 'Khu vực tháp biểu tượng': { 'Khu vực ngoài trời': null } }
  },
  'KHU CÔNG VIÊN - CẢNH QUAN': {
    'Công viên Eden Park': { 'Khuôn viên công viên': { 'Khu vực ngoài trời': null } },
    'Công viên Felix Park': { 'Khuôn viên công viên': { 'Khu vực ngoài trời': null } },
    'Công viên Rainbow Park': { 'Khuôn viên công viên': { 'Khu vực ngoài trời': null } },
    'Công viên Amare Park': { 'Khuôn viên công viên': { 'Khu vực ngoài trời': null } },
    'Vườn Sunflower': { 'Khuôn viên vườn': { 'Khu vực ngoài trời': null } }
  },
  'KHU THƯƠNG MẠI - DỊCH VỤ': {
    'Dịch vụ thương mại – khách sạn': { 'Khối dịch vụ - khách sạn': { 'Khu vực sử dụng chung': null } },
    'Phố đi bộ Sky Avenue': { 'Tuyến phố đi bộ': { 'Khu vực ngoài trời': null } },
    'Nhà dịch vụ': { 'Khối nhà dịch vụ': { 'Khu vực sử dụng chung': null } }
  },
  'KHU TIỆN ÍCH': {
    'Bể bơi Danko The Country': { 'Khuôn viên bể bơi': { 'Khu vực bể bơi': null } }
  }
};

const DANKO_AVENUE_LOCATION_TREE: LocationTree = {
  'KHU ĐIỀU HÀNH': {
    'Văn phòng Bán hàng': { 'Khu văn phòng': { 'Khu vực sử dụng chung': null } },
    'Văn phòng BQLDA': { 'Khu văn phòng': { 'Khu vực sử dụng chung': null } },
    'Kho': { 'Khu kho': { 'Khu vực lưu trữ chung': null } }
  },
  'TIỆN ÍCH NỘI KHU': {
    'Phân khu Milano': { 'Khuôn viên phân khu': { 'Khu vực sử dụng chung': null } },
    'Công viên Bốn Mùa': { 'Khuôn viên công viên': { 'Khu vực ngoài trời': null } },
    'Đại lộ Thắng Lợi rộng 60 m': { 'Tuyến đại lộ': { 'Khu vực ngoài trời': null } },
    'Phân khu Manhattan': { 'Khuôn viên phân khu': { 'Khu vực sử dụng chung': null } },
    'Bể bơi Địa Trung Hải': { 'Khuôn viên bể bơi': { 'Khu vực bể bơi': null } },
    'Đảo lộ Tự Do': { 'Tuyến đảo lộ': { 'Khu vực ngoài trời': null } },
    'Kênh Venice': { 'Khu vực kênh': { 'Khu vực ngoài trời': null } },
    'Đường dạo bộ và thể thao ngoài trời': { 'Tuyến đường dạo bộ': { 'Khu vực ngoài trời': null } },
    'Phân khu Times Square': { 'Khuôn viên phân khu': { 'Khu vực sử dụng chung': null } },
    'Club House': { 'Khối Club House': { 'Khu vực sử dụng chung': null } },
    'Vườn cảnh quan': { 'Khuôn viên vườn': { 'Khu vực ngoài trời': null } }
  }
};

const PROJECT_LOCATION_TREES: Record<string, LocationTree> = {
  'Hà Nội::Văn phòng C6': HANOI_C6_LOCATION_TREE,
  'Hà Nội::Vân Canh': HANOI_VAN_CANH_LOCATION_TREE,
  'Thái Nguyên::Danko City': DANKO_CITY_LOCATION_TREE,
  'Thái Nguyên::Danko Avenue': DANKO_AVENUE_LOCATION_TREE,
  'Bắc Ninh::Danko Riverside': DANKO_RIVERSIDE_LOCATION_TREE,
  'Tuyên Quang::Danko Center': DANKO_CENTER_LOCATION_TREE,
  'Thanh Hóa::Danko The Country': DANKO_THE_COUNTRY_LOCATION_TREE
};

export const getProjectLocationTree = (city: string, project: string) => PROJECT_LOCATION_TREES[`${city}::${project}`] || null;

export const PROJECT_LOCATION_LEVEL_LABELS = [
  'Khu vực',
  'Địa điểm / công trình',
  'Tầng / khu chức năng',
  'Vị trí chi tiết'
];

export const getLocationTreeLevels = (tree: LocationTree | null, selectedPath: string[]) => {
  const levels: string[][] = [];
  let node: LocationTree | null = tree;
  let depth = 0;

  while (node) {
    const options = Object.keys(node);
    if (options.length === 0) break;
    levels.push(options);
    const selected = selectedPath[depth];
    if (!selected || selected === 'Khác') break;
    node = node[selected] || null;
    depth += 1;
  }

  return levels;
};

export const isLocationPathComplete = (tree: LocationTree | null, selectedPath: string[]) => {
  if (selectedPath.length === 0 || selectedPath[0] === 'Khác') return false;
  let node: LocationTree | null = tree;

  for (const segment of selectedPath) {
    if (!node || !Object.prototype.hasOwnProperty.call(node, segment)) return false;
    node = node[segment];
  }

  return node === null;
};

export const findLocationTreePath = (tree: LocationTree, location: string): string[] | null => {
  const normalizePath = (value: string) => value.replace(/\s*[\/-]\s*/g, '-').trim();
  const target = normalizePath(location);
  let match: string[] | null = null;

  const visit = (node: LocationTree, path: string[]) => {
    for (const [name, children] of Object.entries(node)) {
      const nextPath = [...path, name];
      if (normalizePath(nextPath.join('-')) === target) {
        match = nextPath;
        return;
      }
      if (children) visit(children, nextPath);
      if (match) return;
    }
  };

  visit(tree, []);
  return match;
};

export interface ProjectLocationNode {
  id: number;
  cityName: string;
  projectName: string;
  parentPath: string;
  name: string;
  level: number;
}

interface ProjectLocationCatalogEntry {
  id: number;
  cityName: string;
  projectName: string;
}

const cloneLocationTree = (tree: LocationTree): LocationTree => Object.fromEntries(
  Object.entries(tree).map(([name, children]) => [
    name,
    children ? cloneLocationTree(children) : null
  ])
);

export const mergeProjectLocationNodes = (
  tree: LocationTree | null,
  nodes: ProjectLocationNode[],
  city: string,
  project: string
): LocationTree | null => {
  const matchingNodes = nodes
    .filter((node) => node.cityName === city && node.projectName === project)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'vi'));

  if (!tree && matchingNodes.length === 0) return null;
  const merged = tree ? cloneLocationTree(tree) : {};

  matchingNodes.forEach((node) => {
    let parent = merged;
    const parentSegments = node.parentPath
      .split(' / ')
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of parentSegments) {
      if (!Object.prototype.hasOwnProperty.call(parent, segment)) {
        parent[segment] = {};
      } else if (parent[segment] === null) {
        parent[segment] = {};
      }
      parent = parent[segment] as LocationTree;
    }

    if (!Object.prototype.hasOwnProperty.call(parent, node.name)) {
      parent[node.name] = null;
    }
  });

  return merged;
};

interface TransferWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  initialAssetIds?: number[];
  defaultType?: 'HANDOVER' | 'TRANSFER' | 'LOCATION_TRANSFER' | 'RECALL';
  source?: 'ASSET_DETAIL' | 'TRANSFER_LIST';
  editingDocId?: number | null;
}

interface SearchableLocationSelectProps {
  id: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}

const SearchableLocationSelect: React.FC<SearchableLocationSelectProps> = ({
  id,
  value,
  options,
  placeholder,
  onChange
}) => {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    const uniqueOptions = Array.from(new Set(options.filter(Boolean)));
    if (!normalizedQuery || query === value) return uniqueOptions;
    return uniqueOptions.filter((option) => normalizeSearchText(option).includes(normalizedQuery));
  }, [options, query, value]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, options]);

  const selectOption = (option: string) => {
    setQuery(option);
    setIsOpen(false);
    onChange(option);
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          id={id}
          name={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={`${id}-options`}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setIsOpen(false);
              setQuery(value);
            }, 120);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIsOpen(true);
              if (filteredOptions.length > 0) {
                setHighlightedIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
              }
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlightedIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter' && isOpen && filteredOptions[highlightedIndex]) {
              event.preventDefault();
              selectOption(filteredOptions[highlightedIndex]);
            } else if (event.key === 'Escape') {
              setIsOpen(false);
              setQuery(value);
            }
          }}
          className="w-full h-10 pl-3 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-primary-400 outline-none transition-all"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Mở danh sách"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsOpen((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div
          id={`${id}-options`}
          role="listbox"
          className="absolute z-[80] mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => selectOption(option)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold transition-colors ${
                index === highlightedIndex ? 'bg-primary-50 text-primary-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{option}</span>
              {option === value && <Check className="h-3.5 w-3.5 shrink-0 text-primary-600" />}
            </button>
          )) : (
            <div className="px-3 py-3 text-xs font-semibold text-slate-400">
              Không có kết quả phù hợp
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface CatalogAddControlProps {
  id: string;
  addLabel: string;
  fieldLabel: string;
  placeholder: string;
  open: boolean;
  value: string;
  saving: boolean;
  onOpen: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const CatalogAddControl: React.FC<CatalogAddControlProps> = ({
  id,
  addLabel,
  fieldLabel,
  placeholder,
  open,
  value,
  saving,
  onOpen,
  onChange,
  onSubmit,
  onCancel
}) => (
  <div className="pt-1.5">
    {!open ? (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-primary-600 hover:text-primary-700"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    ) : (
      <div className="space-y-2 border-l-2 border-primary-200 pl-3 pt-1">
        <label htmlFor={id} className="block font-bold text-slate-500">{fieldLabel} *</label>
        <input
          id={id}
          name={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          maxLength={200}
          autoFocus
          className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-primary-500 outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="h-8 px-3 rounded-lg bg-primary-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Đang thêm...' : 'Thêm và chọn'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy
          </button>
        </div>
      </div>
    )}
  </div>
);

export const TransferWizard: React.FC<TransferWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
  initialAssetIds = [],
  defaultType,
  source = 'TRANSFER_LIST',
  editingDocId = null
}) => {
  const { hasPermission } = useAuth();
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardType, setWizardType] = useState<'HANDOVER' | 'TRANSFER' | 'LOCATION_TRANSFER' | 'RECALL'>('HANDOVER');
  const [wizardAssets, setWizardAssets] = useState<any[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [wizardForm, setWizardForm] = useState({
    recipientName: '',
    recipientType: 'PERSON' as 'PERSON' | 'AREA',
    recipientArea: '',
    recipientPosition: '',
    recipientDepartment: '',
    recipientPhone: '',
    receiverId: null as number | null,
    receiverDepartmentId: null as number | null,
    newLocation: '',
    newCity: '',
    targetLocationId: null as number | null,
    senderName: 'Nhân viên QLTS',
    senderDepartment: 'Bộ phận QLTS',
    senderPosition: 'Nhân viên',
    senderId: null as number | null,
    reason: '',
    note: '',
    agreedToCommitment: false
  });
  const [isRecipientAreaEditing, setIsRecipientAreaEditing] = useState(false);

  // Dependent Location states
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedLocationPath, setSelectedLocationPath] = useState<string[]>([]);

  const [customCity, setCustomCity] = useState('');
  const [customProject, setCustomProject] = useState('');
  const [customLocation, setCustomLocation] = useState('');

  const handleProjectLocationChange = (depth: number, value: string) => {
    if (value === 'Khác') {
      setSelectedLocationPath(['Khác']);
      setSelectedLocation('Khác');
      setCustomLocation('');
      return;
    }

    const nextPath = [...selectedLocationPath.slice(0, depth), value];
    setSelectedLocationPath(nextPath);
    setSelectedLocation(nextPath.join(' / '));
    setCustomLocation('');
  };

  const getResolvedLocationParts = () => {
    const cityVal = selectedCity === 'Khác' ? customCity : selectedCity;
    const projectVal = selectedProject === 'Khác' ? customProject : selectedProject;
    const locationVal = selectedLocation === 'Khác' ? customLocation : selectedLocation;

    let combinedLocation = '';
    if (cityVal) {
      combinedLocation = cityVal;
      if (projectVal) {
        combinedLocation += '-' + projectVal;
      }
      if (locationVal) {
        combinedLocation += '-' + locationVal;
      }
    } else {
      combinedLocation = locationVal || '';
    }

    return {
      city: cityVal,
      location: combinedLocation || wizardForm.newLocation
    };
  };

  // Metadata Lists
  const [departments, setDepartments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [projectLocationNodes, setProjectLocationNodes] = useState<ProjectLocationNode[]>([]);
  const [projectLocationCatalog, setProjectLocationCatalog] = useState<ProjectLocationCatalogEntry[]>([]);
  const [masterPeople, setMasterPeople] = useState<any[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientOptionsOpen, setRecipientOptionsOpen] = useState(false);
  const [recipientHighlight, setRecipientHighlight] = useState(0);
  const [addingLocationDepth, setAddingLocationDepth] = useState<number | null>(null);
  const [newLocationNodeName, setNewLocationNodeName] = useState('');
  const [isCreatingLocationNode, setIsCreatingLocationNode] = useState(false);
  const [addingCatalogType, setAddingCatalogType] = useState<'CITY' | 'PROJECT' | null>(null);
  const [newCatalogName, setNewCatalogName] = useState('');
  const [isCreatingCatalog, setIsCreatingCatalog] = useState(false);

  const resolvedCity = selectedCity === 'Khác' ? customCity.trim() : selectedCity;
  const resolvedProject = selectedProject === 'Khác' ? customProject.trim() : selectedProject;
  const projectLocationTree = useMemo(
    () => mergeProjectLocationNodes(
      getProjectLocationTree(selectedCity, selectedProject),
      projectLocationNodes,
      resolvedCity,
      resolvedProject
    ),
    [selectedCity, selectedProject, projectLocationNodes, resolvedCity, resolvedProject]
  );
  const baseProjectLocationLevels = getLocationTreeLevels(projectLocationTree, selectedLocationPath);
  const canAddChildToSelectedLeaf = Boolean(
    projectLocationTree
    && selectedLocationPath.length > 0
    && selectedLocationPath[0] !== 'Khác'
    && selectedLocationPath.length < PROJECT_LOCATION_LEVEL_LABELS.length
    && isLocationPathComplete(projectLocationTree, selectedLocationPath)
  );
  const projectLocationLevels = canAddChildToSelectedLeaf
    ? [...baseProjectLocationLevels, []]
    : baseProjectLocationLevels;
  const availableCities = useMemo(() => Array.from(new Set([
    ...Object.keys(LOCATION_HIERARCHY),
    ...projectLocationNodes.map((node) => node.cityName),
    ...projectLocationCatalog.map((entry) => entry.cityName)
  ])).sort((a, b) => a.localeCompare(b, 'vi')), [projectLocationCatalog, projectLocationNodes]);
  const filteredRecipientOptions = useMemo(() => {
    const query = normalizeSearchText(recipientSearch);
    if (!query) return masterPeople.slice(0, 100);
    return masterPeople.filter((person) => normalizeSearchText([
      person.fullName, person.departmentName, person.position, person.phone
    ].filter(Boolean).join(' ')).includes(query)).slice(0, 100);
  }, [masterPeople, recipientSearch]);
  const availableProjects = useMemo(() => Array.from(new Set([
    ...Object.keys(LOCATION_HIERARCHY[selectedCity] || {}),
    ...projectLocationNodes.filter((node) => node.cityName === selectedCity).map((node) => node.projectName),
    ...projectLocationCatalog
      .filter((entry) => entry.cityName === selectedCity && entry.projectName)
      .map((entry) => entry.projectName)
  ])).sort((a, b) => a.localeCompare(b, 'vi')), [projectLocationCatalog, projectLocationNodes, selectedCity]);

  // Search Asset Lookup
  const [assetSearch, setAssetSearch] = useState('');
  const [assetSearchResults, setAssetSearchResults] = useState<any[]>([]);

  // Fetch metadata on mount
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [deptsRes, locsRes, projectNodesRes, projectCatalogRes, masterDataRes] = await Promise.all([
          api.get('/settings/departments'),
          api.get('/settings/locations'),
          api.get('/settings/project-location-nodes'),
          api.get('/settings/project-location-catalog'),
          api.get('/master-data/options').catch(() => ({ data: { people: [] } }))
        ]);
        setDepartments(deptsRes.data);
        setLocations(locsRes.data);
        setProjectLocationNodes(projectNodesRes.data);
        setProjectLocationCatalog(projectCatalogRes.data);
        setMasterPeople(masterDataRes.data?.people || []);
      } catch (err) {
        console.error('Error loading wizard metadata:', err);
      }
    };
    fetchMetadata();
  }, []);

  // Update Combined Location whenever dependent fields change
  useEffect(() => {
    const resolved = getResolvedLocationParts();

    setWizardForm(prev => ({
      ...prev,
      newCity: resolved.city,
      newLocation: resolved.location,
      recipientArea: prev.recipientType === 'AREA' && resolved.location && !isRecipientAreaEditing
        ? resolved.location
        : prev.recipientArea
    }));
  }, [selectedCity, selectedProject, selectedLocation, customCity, customProject, customLocation]);

  const parseLocationToStates = (fullLocation: string) => {
    if (!fullLocation) return;
    const trimmed = fullLocation.trim();

    // Check shorthand matching
    const lower = trimmed.toLowerCase();
    const cleanStr = lower.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    let resolvedCity = '';
    let resolvedProject = '';
    let resolvedLocation = '';
    
    if (/\bmat truoc c6 (?:ii|2)\b/.test(cleanStr)) {
      resolvedCity = 'Hà Nội';
      resolvedProject = 'Văn phòng C6';
      resolvedLocation = 'Mặt trước C6-II';
    } else if (/\bmat truoc c6 (?:i|1)\b/.test(cleanStr)) {
      resolvedCity = 'Hà Nội';
      resolvedProject = 'Văn phòng C6';
      resolvedLocation = 'Mặt trước C6-I';
    } else if (/\bmat sau c6 (?:ii|2)\b/.test(cleanStr)) {
      resolvedCity = 'Hà Nội';
      resolvedProject = 'Văn phòng C6';
      resolvedLocation = 'Mặt sau C6-II';
    } else if (/\bmat sau c6 (?:i|1)\b/.test(cleanStr)) {
      resolvedCity = 'Hà Nội';
      resolvedProject = 'Văn phòng C6';
      resolvedLocation = 'Mặt sau C6-I';
    } else {
      const parts = trimmed.split(/\s+(?:-|\/)\s+/).map(p => p.trim());
      if (parts.length >= 3) {
        resolvedCity = parts[0];
        resolvedProject = parts[1];
        resolvedLocation = parts.slice(2).join('-');
      } else if (parts.length === 2) {
        resolvedCity = parts[0];
        resolvedLocation = parts[1];
      } else {
        resolvedLocation = trimmed;
      }
    }

    if (resolvedCity) {
      if (LOCATION_HIERARCHY[resolvedCity]) {
        setSelectedCity(resolvedCity);
        if (resolvedProject) {
          if (LOCATION_HIERARCHY[resolvedCity][resolvedProject]) {
            setSelectedProject(resolvedProject);
            if (resolvedLocation) {
              const resolvedTree = getProjectLocationTree(resolvedCity, resolvedProject);
              if (resolvedTree) {
                const resolvedPath = findLocationTreePath(resolvedTree, resolvedLocation);
                if (resolvedPath) {
                  setSelectedLocationPath(resolvedPath);
                  setSelectedLocation(resolvedPath.join(' / '));
                } else {
                  setSelectedLocationPath(['Khác']);
                  setSelectedLocation('Khác');
                  setCustomLocation(resolvedLocation);
                }
              } else if (LOCATION_HIERARCHY[resolvedCity][resolvedProject].includes(resolvedLocation)) {
                setSelectedLocationPath([]);
                setSelectedLocation(resolvedLocation);
              } else {
                setSelectedLocationPath([]);
                setSelectedLocation('Khác');
                setCustomLocation(resolvedLocation);
              }
            }
          } else {
            setSelectedLocationPath([]);
            setSelectedProject('Khác');
            setCustomProject(resolvedProject);
            setSelectedLocation('Khác');
            setCustomLocation(resolvedLocation);
          }
        }
      } else {
        setSelectedLocationPath([]);
        setSelectedCity('Khác');
        setCustomCity(resolvedCity);
        if (resolvedProject) {
          setSelectedProject('Khác');
          setCustomProject(resolvedProject);
        }
        if (resolvedLocation) {
          setSelectedLocation('Khác');
          setCustomLocation(resolvedLocation);
        }
      }
    } else if (resolvedLocation) {
      setSelectedLocationPath([]);
      setSelectedCity('Khác');
      setSelectedProject('Khác');
      setSelectedLocation('Khác');
      setCustomLocation(resolvedLocation);
    }
  };

  // Handle open state change
  useEffect(() => {
    if (isOpen) {
      if (editingDocId) {
        fetchDraftDetails(editingDocId);
      } else if (initialAssetIds.length > 0) {
        fetchInitialAssets(initialAssetIds);
      } else {
        resetWizardState();
      }
    }
  }, [isOpen, editingDocId, initialAssetIds]);

  // When wizardType changes, update sender/recipient defaults
  useEffect(() => {
    if (editingDocId) return; // Do not overwrite draft details if editing
    setRecipientSearch('');

    if (wizardType === 'HANDOVER') {
      setWizardForm(prev => ({
        ...prev,
        senderName: 'Nhân viên QLTS',
        senderDepartment: 'Bộ phận QLTS',
        recipientName: '',
        recipientType: 'PERSON',
        recipientArea: '',
        recipientPosition: '',
        recipientDepartment: '',
        receiverDepartmentId: null,
        newLocation: '',
        targetLocationId: null,
        senderPosition: 'Nhân viên'
      }));
    } else if (wizardType === 'TRANSFER') {
      const firstAsset = wizardAssets[0];
      setWizardForm(prev => ({
        ...prev,
        senderName: firstAsset?.currentUserName || 'Nhân viên QLTS',
        senderDepartment: firstAsset?.departmentName || 'Bộ phận QLTS',
        recipientName: '',
        recipientType: 'PERSON',
        recipientArea: '',
        recipientPosition: '',
        recipientDepartment: '',
        receiverDepartmentId: null,
        newLocation: '',
        targetLocationId: null,
        senderPosition: firstAsset?.currentPosition || 'Nhân viên'
      }));
    } else if (wizardType === 'LOCATION_TRANSFER') {
      const firstAsset = wizardAssets[0];
      setWizardForm(prev => ({
        ...prev,
        senderName: firstAsset?.currentUserName || 'Nhân viên QLTS',
        senderDepartment: firstAsset?.departmentName || 'Bộ phận QLTS',
        senderPosition: firstAsset?.currentPosition || 'Nhân viên',
        recipientName: firstAsset?.currentUserName || 'GIỮ NGUYÊN PHÂN BỔ HIỆN TẠI',
        recipientType: 'PERSON',
        recipientArea: '',
        recipientPosition: firstAsset?.currentPosition || '',
        recipientDepartment: firstAsset?.departmentName || '',
        recipientPhone: firstAsset?.currentUserPhone || '',
        receiverDepartmentId: null,
        newLocation: '',
        targetLocationId: null
      }));
    } else if (wizardType === 'RECALL') {
      const firstAsset = wizardAssets[0];
      // Default recall location is "Kho QLTS" or "Kho trung tâm"
      const defaultLoc = locations.find(l => l.name.toLowerCase().includes('kho qlts') || l.name.toLowerCase().includes('kho trung tâm')) || locations[0];
      setWizardForm(prev => ({
        ...prev,
        senderName: firstAsset?.currentUserName || 'Nhân viên QLTS',
        senderDepartment: firstAsset?.departmentName || 'Bộ phận QLTS',
        recipientName: 'Bộ phận QLTS / Kho',
        recipientType: 'PERSON',
        recipientArea: '',
        recipientPosition: 'Cán bộ quản lý tài sản',
        recipientDepartment: 'Bộ phận QLTS',
        receiverDepartmentId: departments.find(d => d.name.toLowerCase().includes('qlts') || d.name.toLowerCase().includes('hành chính'))?.id || null,
        newLocation: defaultLoc?.name || 'Kho QLTS',
        newCity: defaultLoc?.city || 'Hà Nội',
        targetLocationId: defaultLoc?.id || null,
        senderPosition: firstAsset?.currentPosition || 'Nhân viên'
      }));
      if (defaultLoc) {
        parseLocationToStates(defaultLoc.name);
      }
    }
  }, [wizardType, wizardAssets, locations, departments, editingDocId]);

  const resetWizardState = () => {
    setWizardStep(1);
    setWizardType(defaultType || 'HANDOVER');
    setWizardAssets([]);
    setRecipientSearch('');
    setRecipientOptionsOpen(false);
    setIsRecipientAreaEditing(false);
    setWizardForm({
      recipientName: '',
      recipientType: 'PERSON',
      recipientArea: '',
      recipientPosition: '',
      recipientDepartment: '',
      recipientPhone: '',
      receiverId: null as number | null,
      receiverDepartmentId: null as number | null,
      newLocation: '',
      newCity: '',
      targetLocationId: null as number | null,
      senderName: 'Nhân viên QLTS',
      senderDepartment: 'Bộ phận QLTS',
      senderPosition: 'Nhân viên',
      senderId: null as number | null,
      reason: '',
      note: '',
      agreedToCommitment: false
    });
    setSelectedCity('');
    setSelectedProject('');
    setSelectedLocation('');
    setSelectedLocationPath([]);
    setCustomCity('');
    setCustomProject('');
    setCustomLocation('');
    setAddingLocationDepth(null);
    setNewLocationNodeName('');
    setIsCreatingLocationNode(false);
  };

  const fetchInitialAssets = async (ids: number[]) => {
    setLoadingAssets(true);
    setIsRecipientAreaEditing(false);
    try {
      const list = await Promise.all(
        ids.map(async (id) => {
          const res = await api.get(`/assets/${id}`);
          return res.data;
        })
      );
      setWizardAssets(list);

      const firstAsset = list[0];
      const inferredType = firstAsset?.status === 'IN_STOCK' ? 'HANDOVER' : 'TRANSFER';
      setWizardType(defaultType || inferredType);

      // Prefill sender
      setWizardForm(prev => ({
        ...prev,
        senderName: firstAsset?.currentUserName || 'Nhân viên QLTS',
        senderPosition: firstAsset?.currentPosition || 'Nhân viên',
        senderDepartment: firstAsset?.departmentName || 'Bộ phận QLTS',
        newLocation: firstAsset?.locationName || '',
        newCity: firstAsset?.cityName || ''
      }));
      if (firstAsset?.locationName) {
        parseLocationToStates(firstAsset.locationName);
      }

      // Directly jump to Step 2
      setWizardStep(2);
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải thông tin tài sản khởi tạo.');
    } finally {
      setLoadingAssets(false);
    }
  };

  const fetchDraftDetails = async (id: number) => {
    setLoadingAssets(true);
    setIsRecipientAreaEditing(false);
    try {
      const res = await api.get(`/handover/${id}`);
      const detail = res.data;
      setWizardType(detail.type);
      setWizardStep(2);
      setWizardForm({
        recipientName: detail.recipientName || '',
        recipientType: detail.recipientType === 'AREA' ? 'AREA' : 'PERSON',
        recipientArea: detail.recipientArea || '',
        recipientPosition: detail.recipientPosition || '',
        recipientDepartment: detail.recipientDepartment || '',
        recipientPhone: detail.recipientPhone || '',
        receiverId: detail.receiverId || null,
        receiverDepartmentId: detail.receiverDepartmentId || null,
        newLocation: detail.newLocation || '',
        newCity: detail.newCity || '',
        targetLocationId: detail.targetLocationId || null,
        senderName: detail.senderName || '',
        senderDepartment: detail.senderDepartment || '',
        senderPosition: detail.senderPosition || '',
        senderId: detail.senderId || null,
        reason: detail.reason || '',
        note: detail.note || '',
        agreedToCommitment: false
      });
      if (detail.newLocation) {
        parseLocationToStates(detail.newLocation);
      }

      const assetsObj = await Promise.all(
        detail.items.map(async (item: any) => {
          try {
            const assetRes = await api.get(`/assets/${item.assetId}`);
            return assetRes.data;
          } catch {
            return { id: item.assetId, assetCode: item.assetCode, assetName: item.assetName, status: item.oldStatus };
          }
        })
      );
      setWizardAssets(assetsObj);
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải thông tin hồ sơ nháp.');
    } finally {
      setLoadingAssets(false);
    }
  };

  const handleDepartmentSelect = (deptId: number) => {
    const dept = departments.find(d => d.id === deptId);
    if (dept) {
      setWizardForm(prev => ({
        ...prev,
        receiverDepartmentId: deptId,
        recipientDepartment: dept.name
      }));
    }
  };

  const handleRecipientSelect = (key: string) => {
    const person = masterPeople.find((item) => item.key === key);
    if (!person) {
      setWizardForm((current) => ({ ...current, recipientName: '', recipientPosition: '', recipientPhone: '', recipientDepartment: '', receiverDepartmentId: null, receiverId: null }));
      return;
    }
    const department = departments.find((item) => item.name === person.departmentName);
    setWizardForm((current) => ({
      ...current,
      recipientName: person.fullName,
      recipientPosition: person.position || '',
      recipientPhone: person.phone || '',
      recipientDepartment: person.departmentName || '',
      receiverDepartmentId: department?.id || null,
      receiverId: person.source === 'USER' ? person.id : null
    }));
    setRecipientSearch(person.fullName);
    setRecipientOptionsOpen(false);
    const location = [person.cityName, person.projectName, person.locationName].filter(Boolean).join(' - ');
    if (location) parseLocationToStates(location);
  };

  const handleRecipientSearchChange = (value: string) => {
    setRecipientSearch(value);
    setRecipientOptionsOpen(true);
    setRecipientHighlight(0);
    if (value !== wizardForm.recipientName) {
      setWizardForm((current) => ({ ...current, recipientName: '', recipientPosition: '', recipientPhone: '', recipientDepartment: '', receiverDepartmentId: null, receiverId: null }));
    }
  };

  const handleRecipientSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setRecipientOptionsOpen(true);
      setRecipientHighlight((current) => Math.min(current + 1, Math.max(filteredRecipientOptions.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setRecipientHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && recipientOptionsOpen && filteredRecipientOptions[recipientHighlight]) {
      event.preventDefault();
      handleRecipientSelect(filteredRecipientOptions[recipientHighlight].key);
    } else if (event.key === 'Escape') {
      setRecipientOptionsOpen(false);
    }
  };

  useEffect(() => {
    if (wizardForm.recipientName) setRecipientSearch(wizardForm.recipientName);
  }, [wizardForm.recipientName]);

  const handleSenderSelect = (key: string) => {
    const person = masterPeople.find((item) => item.key === key);
    if (!person) return;
    setWizardForm((current) => ({
      ...current,
      senderName: person.fullName,
      senderPosition: person.position || '',
      senderDepartment: person.departmentName || '',
      senderId: person.source === 'USER' ? person.id : null
    }));
  };

  const handleCreateProjectLocation = async (depth: number) => {
    const name = newLocationNodeName.trim();
    const levelLabel = PROJECT_LOCATION_LEVEL_LABELS[depth] || `Phân cấp ${depth + 1}`;
    if (!name) {
      toast.error(`Vui lòng nhập tên ${levelLabel}`);
      return;
    }
    if (!resolvedCity || !resolvedProject) {
      toast.error('Vui lòng chọn Thành phố và Dự án trước');
      return;
    }
    if (depth > 0 && selectedLocationPath.slice(0, depth).filter(Boolean).length !== depth) {
      const parentLabel = PROJECT_LOCATION_LEVEL_LABELS[depth - 1] || `phân cấp ${depth}`;
      toast.error(`Vui lòng chọn ${parentLabel} trước`);
      return;
    }

    setIsCreatingLocationNode(true);
    try {
      const parentPath = depth === 0 ? '' : selectedLocationPath.slice(0, depth).join(' / ');
      const res = await api.post('/settings/project-location-nodes', {
        cityName: resolvedCity,
        projectName: resolvedProject,
        parentPath,
        name,
        level: depth + 1
      });
      const created = res.data as ProjectLocationNode;
      setProjectLocationNodes((current) => [
        ...current.filter((node) => node.id !== created.id),
        created
      ]);

      const nextPath = [...selectedLocationPath.slice(0, depth), created.name];
      setSelectedLocationPath(nextPath);
      setSelectedLocation(nextPath.join(' / '));
      setCustomLocation('');
      setAddingLocationDepth(null);
      setNewLocationNodeName('');
      toast.success(`Đã thêm và chọn ${created.name}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thêm vị trí mới');
    } finally {
      setIsCreatingLocationNode(false);
    }
  };

  const handleCreateLocationCatalog = async (type: 'CITY' | 'PROJECT') => {
    const name = newCatalogName.trim();
    if (!name) {
      toast.error(type === 'CITY' ? 'Vui lòng nhập tên thành phố' : 'Vui lòng nhập tên dự án');
      return;
    }
    if (type === 'PROJECT' && !resolvedCity) {
      toast.error('Vui lòng chọn thành phố trước');
      return;
    }

    setIsCreatingCatalog(true);
    try {
      const res = await api.post('/settings/project-location-catalog', {
        type,
        cityName: type === 'CITY' ? name : resolvedCity,
        projectName: type === 'PROJECT' ? name : ''
      });
      const created = res.data as ProjectLocationCatalogEntry;
      setProjectLocationCatalog((current) => [
        ...current.filter((entry) => entry.id !== created.id),
        created
      ]);

      if (type === 'CITY') {
        setSelectedCity(created.cityName);
        setSelectedProject('');
        setCustomCity('');
        setCustomProject('');
      } else {
        setSelectedProject(created.projectName);
        setCustomProject('');
      }
      setSelectedLocation('');
      setSelectedLocationPath([]);
      setCustomLocation('');
      setAddingLocationDepth(null);
      setNewLocationNodeName('');
      setAddingCatalogType(null);
      setNewCatalogName('');
      toast.success(type === 'CITY' ? `Đã thêm thành phố ${created.cityName}` : `Đã thêm dự án ${created.projectName}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thêm dữ liệu mới');
    } finally {
      setIsCreatingCatalog(false);
    }
  };

  const handleLocationSelect = (locId: number) => {
    const loc = locations.find(l => l.id === locId);
    if (loc) {
      setWizardForm(prev => ({
        ...prev,
        targetLocationId: locId,
        newLocation: loc.name,
        newCity: loc.city
      }));
    }
  };

  const searchWizardAssets = async (val: string) => {
    setAssetSearch(val);
    if (val.trim().length < 2) {
      setAssetSearchResults([]);
      return;
    }
    try {
      const res = await api.get('/assets', { params: { search: val, limit: 10 } });
      const filtered = res.data.assets.filter((a: any) => 
        a.status !== 'LIQUIDATED' && a.status !== 'LOST'
      );
      setAssetSearchResults(filtered);
    } catch (err) {
      console.error(err);
    }
  };

  const addWizardAsset = (asset: any) => {
    if (wizardAssets.some(x => x.id === asset.id)) {
      toast.warning('Tài sản này đã được thêm vào danh sách.');
      return;
    }
    setWizardAssets([...wizardAssets, asset]);
    setAssetSearch('');
    setAssetSearchResults([]);
  };

  const removeWizardAsset = (id: number) => {
    if (source === 'ASSET_DETAIL' && wizardAssets.length === 1) {
      toast.error('Hồ sơ tạo từ chi tiết tài sản không được để trống tài sản khởi tạo.');
      return;
    }
    setWizardAssets(wizardAssets.filter(x => x.id !== id));
  };

  // Submission Flow
  const handleSubmit = async (action: 'DRAFT' | 'COMPLETE' | 'PRINT') => {
    if (wizardAssets.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 tài sản.');
      return;
    }
    if (
      (wizardType === 'HANDOVER' || wizardType === 'TRANSFER')
      && wizardForm.recipientType === 'PERSON'
      && !wizardForm.recipientName.trim()
    ) {
      toast.error('Vui lòng điền thông tin người nhận.');
      return;
    }
    if (
      (wizardType === 'HANDOVER' || wizardType === 'TRANSFER')
      && wizardForm.recipientType === 'AREA'
      && !wizardForm.recipientArea.trim()
    ) {
      toast.error('Vui lòng nhập khu vực nhận hoặc nơi đặt tài sản.');
      return;
    }
    if (wizardType === 'RECALL' && !wizardForm.newLocation.trim()) {
      toast.error('Vui lòng chọn kho/vị trí nhận.');
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedDestination = getResolvedLocationParts();
      const payload = {
        type: wizardType,
        recipientName: wizardForm.recipientName,
        recipientType: wizardForm.recipientType,
        recipientArea: wizardForm.recipientArea,
        recipientPosition: wizardForm.recipientPosition,
        recipientDepartment: wizardForm.recipientDepartment,
        recipientPhone: wizardForm.recipientPhone,
        receiverId: wizardForm.receiverId,
        receiverDepartmentId: wizardForm.receiverDepartmentId,
        newLocation: resolvedDestination.location,
        newCity: resolvedDestination.city || wizardForm.newCity,
        targetLocationId: wizardForm.targetLocationId,
        senderName: wizardForm.senderName,
        senderDepartment: wizardForm.senderDepartment,
        senderPosition: wizardForm.senderPosition,
        senderId: wizardForm.senderId,
        reason: wizardForm.reason,
        note: wizardForm.note,
        assetIds: wizardAssets.map(a => a.id),
      };

      if (action === 'DRAFT') {
        if (editingDocId) {
          await api.patch(`/handover/${editingDocId}`, { ...payload, status: 'DRAFT' });
          toast.success('Đã cập nhật hồ sơ nháp thành công!');
        } else {
          await api.post('/handover', { ...payload, status: 'DRAFT' });
          toast.success('Đã lưu nháp hồ sơ thành công!');
        }
        onComplete();
        onClose();
      } else {
        // Complete or Print flow
        let documentRes;
        if (editingDocId) {
          // If editing a draft, patch and then confirm it
          await api.patch(`/handover/${editingDocId}`, payload);
          documentRes = await api.post(`/handover/${editingDocId}/complete`);
        } else {
          // Atomic create and complete
          const res = await api.post('/handover/complete', payload);
          documentRes = res;
        }

        const docData = documentRes.data;
        toast.success(`Đã hoàn thành hồ sơ ${docData.documentNo || ''} thành công!`);

        if (action === 'PRINT') {
          // Trigger direct print dialog
          const printUrl = `${api.defaults.baseURL}/handover/${docData.id}/pdf?token=${localStorage.getItem('token') || ''}`;
          const printWindow = window.open(printUrl, '_blank');
          if (!printWindow) {
            toast.error('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép popup.');
          } else {
            printWindow.onload = () => {
              printWindow.focus();
              printWindow.print();
            };
          }
        }

        onComplete();
        onClose();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi xử lý hồ sơ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="wizard" noScroll>
      <div className="w-full h-full bg-white flex flex-col">
        
        {/* Header Section */}
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              {wizardType === 'HANDOVER' ? 'Lập biên bản bàn giao' : 
               wizardType === 'TRANSFER' ? 'Lập biên bản điều chuyển' : 
               wizardType === 'LOCATION_TRANSFER' ? 'Lập biên bản điều chuyển vị trí' :
               'Lập biên bản thu hồi'}
            </h2>
            <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mt-0.5">
              Hỗ trợ Bàn giao, Điều chuyển & Thu hồi tài sản
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex justify-between items-center shrink-0 overflow-x-auto no-scrollbar">
          {[
            { step: 1, label: 'Loại nghiệp vụ' },
            { step: 2, label: 'Danh sách tài sản' },
            { step: 3, label: 'Thông tin các bên' },
            { step: 4, label: 'Cam kết bàn giao' },
            { step: 5, label: 'Xem trước & Lưu' },
          ].map((item) => (
            <div key={item.step} className="flex items-center space-x-2 shrink-0">
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                wizardStep === item.step
                  ? 'bg-slate-900 text-white ring-4 ring-slate-100'
                  : (wizardStep > item.step ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-450')
              }`}>
                {wizardStep > item.step ? <Check className="h-3.5 w-3.5" /> : item.step}
              </span>
              <span className={`text-[10px] font-black uppercase tracking-wider ${
                wizardStep === item.step ? 'text-slate-900' : 'text-slate-400'
              }`}>
                {item.label}
              </span>
              {item.step < 5 && <span className="text-slate-200 font-light mx-2">/</span>}
            </div>
          ))}
        </div>

        {/* Form Body View */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loadingAssets ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900"></div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Đang tải thông tin tài sản...</p>
            </div>
          ) : (
            <>
              {/* STEP 1: CHỌN NGHIỆP VỤ */}
              {wizardStep === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <div className="text-center max-w-xl mx-auto space-y-1">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">BƯỚC 1: CHỌN LOẠI NGHIỆP VỤ LUÂN CHUYỂN</h3>
                    <p className="text-xs text-slate-400 font-medium">Hệ thống hỗ trợ 4 quy trình chính. Trạng thái của tài sản sẽ được cập nhật tự động sau khi hồ sơ được xác nhận.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
                    {/* Bàn giao cấp phát */}
                    <button 
                      onClick={() => { setWizardType('HANDOVER'); setWizardStep(2); }}
                      className={`p-6 border-2 rounded-2xl text-left transition-all hover:shadow-xl flex flex-col justify-between h-48 ${
                        wizardType === 'HANDOVER' ? 'border-slate-900 bg-slate-50/50' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <span className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
                        <CheckCircle2 className="h-5 w-5" />
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">1. Bàn giao cấp phát</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">Cấp phát tài sản trong kho cho nhân viên / phòng ban sử dụng mới.</p>
                      </div>
                    </button>

                    {/* Điều chuyển phòng ban */}
                    <button 
                      onClick={() => { setWizardType('TRANSFER'); setWizardStep(2); }}
                      className={`p-6 border-2 rounded-2xl text-left transition-all hover:shadow-xl flex flex-col justify-between h-48 ${
                        wizardType === 'TRANSFER' ? 'border-amber-500 bg-amber-50/10' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <span className="h-10 w-10 bg-amber-500 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
                        <ArrowRightLeft className="h-5 w-5" />
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-amber-600 uppercase tracking-wider">2. Điều chuyển phòng ban</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">Luân chuyển tài sản giữa các bộ phận, dự án hoặc thay đổi người sở hữu.</p>
                      </div>
                    </button>

                    {/* Điều chuyển vị trí */}
                    <button
                      onClick={() => { setWizardType('LOCATION_TRANSFER'); setWizardStep(2); }}
                      className={`p-6 border-2 rounded-2xl text-left transition-all hover:shadow-xl flex flex-col justify-between h-48 ${
                        wizardType === 'LOCATION_TRANSFER' ? 'border-sky-500 bg-sky-50/20' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <span className="h-10 w-10 bg-sky-500 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
                        <MapPin className="h-5 w-5" />
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-sky-600 uppercase tracking-wider">3. Điều chuyển vị trí</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">Chỉ thay đổi vị trí tài sản; giữ nguyên người dùng, chức vụ, số điện thoại, phòng ban và trạng thái.</p>
                      </div>
                    </button>

                    {/* Thu hồi về kho */}
                    <button 
                      onClick={() => { setWizardType('RECALL'); setWizardStep(2); }}
                      className={`p-6 border-2 rounded-2xl text-left transition-all hover:shadow-xl flex flex-col justify-between h-48 ${
                        wizardType === 'RECALL' ? 'border-rose-500 bg-rose-50/10' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <span className="h-10 w-10 bg-rose-500 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
                        <RotateCcw className="h-5 w-5" />
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-rose-600 uppercase tracking-wider">4. Thu hồi về kho</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">Thu hồi thiết bị từ nhân viên thôi việc, hết nhu cầu về kho lưu giữ.</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: CHỌN TÀI SẢN */}
              {wizardStep === 2 && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                      BƯỚC 2: TÀI SẢN THAM GIA HỒ SƠ ({wizardAssets.length})
                    </h3>
                    {wizardAssets.length > 1 && source !== 'ASSET_DETAIL' && (
                      <button onClick={() => setWizardAssets([])} className="text-xs font-bold text-rose-500 hover:underline">
                        Xóa tất cả chọn
                      </button>
                    )}
                  </div>

                  {/* Search Bar */}
                  <div className="relative max-w-xl">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input 
                      type="text"
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-slate-100 focus:bg-white transition-all text-xs font-bold text-slate-900 placeholder:text-slate-400"
                      placeholder="Tìm theo Mã tài sản, Số Serial hoặc tên thiết bị..."
                      value={assetSearch}
                      onChange={(e) => searchWizardAssets(e.target.value)}
                    />

                    {assetSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-2xl z-20 overflow-hidden max-h-60 overflow-y-auto">
                        {assetSearchResults.map(a => (
                          <button
                            key={a.id}
                            onClick={() => addWizardAsset(a)}
                            className="w-full px-5 py-3 hover:bg-slate-50 text-left flex items-center justify-between border-b last:border-0"
                          >
                            <div>
                              <p className="text-xs font-bold text-slate-900">{a.assetName}</p>
                              <p className="text-[10px] text-slate-400 font-bold">{a.assetCode} • {a.status} • {a.currentUserName || 'Trong kho'}</p>
                            </div>
                            <Plus className="h-4 w-4 text-slate-500" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selected Assets Table */}
                  <div className="table-container rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-white">
                        <tr>
                          <th className="p-3 font-bold uppercase tracking-wider text-[10px]">Mã tài sản</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[10px]">Tên tài sản</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[10px]">Số Serial</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[10px]">Người dùng cũ</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[10px]">Vị trí hiện tại</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[10px] text-center">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {wizardAssets.map(a => (
                          <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-mono font-bold text-slate-900">{a.assetCode}</td>
                            <td className="p-3 font-bold text-slate-700">{a.assetName}</td>
                            <td className="p-3 text-slate-500 font-medium">{a.serialNumber || '---'}</td>
                            <td className="p-3 text-slate-600 font-semibold">{a.currentUserName || 'Trong kho'}</td>
                            <td className="p-3 text-slate-500">{a.locationName || '---'}</td>
                            <td className="p-3 text-center">
                              <button 
                                onClick={() => removeWizardAsset(a.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {wizardAssets.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-400 italic font-bold">
                              Chưa có thiết bị tài sản nào được chọn. Nhập tìm kiếm ở trên để bắt đầu thêm.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STEP 3: THÔNG TIN CHI TIẾT SENDER / RECIPIENT */}
              {wizardStep === 3 && (
                <div className="space-y-6 animate-fade-in">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                    BƯỚC 3: CUNG CẤP THÔNG TIN CÁC BÊN & ĐỊA ĐIỂM
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* BÊN NHẬN / BÊN THU HỒI */}
                    <div className="space-y-4 p-5 border border-slate-200 rounded-2xl bg-white shadow-sm">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-1.5 border-b pb-2">
                        <User className="h-4 w-4 text-slate-500" />
                        {wizardType === 'RECALL'
                          ? 'ĐƠN VỊ THU HỒI (BÊN NHẬN)'
                          : wizardType === 'LOCATION_TRANSFER'
                            ? 'PHÂN BỔ ĐƯỢC GIỮ NGUYÊN'
                            : 'BÊN NHẬN TÀI SẢN'}
                      </h4>

                      <div className="space-y-3 text-xs">
                        {wizardType === 'LOCATION_TRANSFER' && (
                          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] font-bold leading-relaxed text-sky-800">
                            Người sử dụng, số điện thoại, chức vụ, phòng ban và trạng thái của từng tài sản được giữ nguyên. Hồ sơ này chỉ cập nhật vị trí mới.
                          </div>
                        )}
                        {wizardType !== 'RECALL' && wizardType !== 'LOCATION_TRANSFER' && (
                          <div className="space-y-1.5">
                            <span className="font-bold text-slate-500">Bàn giao cho</span>
                            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Loại bên nhận">
                              {[
                                { value: 'PERSON' as const, label: 'Cá nhân', icon: User },
                                { value: 'AREA' as const, label: 'Khu vực / vị trí', icon: MapPin }
                              ].map((option) => {
                                const OptionIcon = option.icon;
                                const active = wizardForm.recipientType === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      setWizardForm((current) => ({
                                        ...current,
                                        recipientType: option.value,
                                        recipientArea: option.value === 'AREA' ? current.recipientArea : '',
                                        recipientPosition: option.value === 'AREA' ? '' : current.recipientPosition,
                                        receiverId: option.value === 'AREA' ? null : current.receiverId
                                      }));
                                      setIsRecipientAreaEditing(false);
                                    }}
                                    className={`h-9 rounded-lg inline-flex items-center justify-center gap-1.5 text-[10px] font-black uppercase transition-colors ${
                                      active
                                        ? 'bg-white text-primary-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                    aria-pressed={active}
                                  >
                                    <OptionIcon className="h-3.5 w-3.5" />
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {wizardForm.recipientType === 'AREA' && wizardType !== 'RECALL' && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <label htmlFor="handover-recipient-area" className="font-bold text-slate-500">
                                Tên khu vực nhận / nơi đặt tài sản *
                              </label>
                              <button
                                type="button"
                                onClick={() => setIsRecipientAreaEditing((current) => !current)}
                                className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[10px] font-black uppercase transition-colors ${
                                  isRecipientAreaEditing
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                                }`}
                              >
                                {isRecipientAreaEditing ? <Check className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                                {isRecipientAreaEditing ? 'Xong' : 'Sửa'}
                              </button>
                            </div>
                            <input
                              id="handover-recipient-area"
                              name="recipientArea"
                              type="text"
                              className={`w-full px-3 py-2 border rounded-xl text-xs font-bold text-slate-800 transition-all ${
                                isRecipientAreaEditing
                                  ? 'border-sky-300 bg-white ring-2 ring-sky-100 focus:border-sky-400 focus:outline-none'
                                  : 'border-slate-200 bg-slate-50'
                              }`}
                              placeholder={isRecipientAreaEditing ? 'Nhập tên khu vực muốn hiển thị...' : 'Chọn vị trí phân cấp bên phải'}
                              readOnly={!isRecipientAreaEditing}
                              value={wizardForm.recipientArea}
                              onChange={(event) => setWizardForm((current) => ({ ...current, recipientArea: event.target.value }))}
                            />
                            <p className="text-[10px] text-slate-400 font-medium">
                              {isRecipientAreaEditing
                                ? 'Tên nhập tay sẽ được dùng để hiển thị; vị trí phân cấp bên phải vẫn là vị trí hiện tại của tài sản.'
                                : 'Vị trí phân cấp bên phải sẽ được dùng làm tên mặc định. Bấm Sửa để nhập tên hiển thị khác.'}
                            </p>
                          </div>
                        )}

                        <div className="relative space-y-1">
                          <label htmlFor="handover-recipient-name" className="font-bold text-slate-500">
                            {wizardForm.recipientType === 'AREA' && wizardType !== 'RECALL'
                              ? 'Người phụ trách khu vực (nếu có)'
                              : 'Họ tên người nhận *'}
                          </label>
                          <input
                            id="handover-recipient-name"
                            name="recipientName"
                            type="text"
                            autoComplete="off"
                            role="combobox"
                            aria-expanded={recipientOptionsOpen}
                            aria-controls="handover-recipient-options"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white transition-all"
                            disabled={wizardType === 'RECALL' || wizardType === 'LOCATION_TRANSFER'}
                            placeholder={wizardForm.recipientType === 'AREA' ? 'Gõ để chọn người phụ trách...' : 'Gõ tên, phòng ban hoặc số điện thoại...'}
                            value={recipientSearch}
                            onChange={(event) => handleRecipientSearchChange(event.target.value)}
                            onFocus={() => setRecipientOptionsOpen(true)}
                            onBlur={() => window.setTimeout(() => setRecipientOptionsOpen(false), 150)}
                            onKeyDown={handleRecipientSearchKeyDown}
                          />
                          {recipientOptionsOpen && wizardType !== 'RECALL' && wizardType !== 'LOCATION_TRANSFER' && <div id="handover-recipient-options" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl custom-scrollbar">
                            {filteredRecipientOptions.map((person, index) => <button key={person.key} type="button" role="option" aria-selected={index === recipientHighlight} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setRecipientHighlight(index)} onClick={() => handleRecipientSelect(person.key)} className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${index === recipientHighlight ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
                              <span className="block text-xs font-black text-slate-800">{person.fullName}</span>
                              <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-500">{[person.departmentName, person.position, person.phone].filter(Boolean).join(' - ') || 'Chưa có thông tin liên hệ'}</span>
                            </button>)}
                            {filteredRecipientOptions.length === 0 && <div className="px-3 py-5 text-center text-xs font-bold text-slate-400">Không tìm thấy người phù hợp.</div>}
                          </div>}
                          <p className="text-[10px] font-medium text-slate-400">Dữ liệu được quản lý tập trung tại Big Data Center.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {wizardForm.recipientType !== 'AREA' && (
                            <div className="space-y-1">
                            <label className="font-bold text-slate-500">Chức vụ</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white transition-all"
                              placeholder="Nhân viên"
                              disabled
                              value={wizardForm.recipientPosition}
                              onChange={(e) => setWizardForm({...wizardForm, recipientPosition: e.target.value})}
                            />
                            </div>
                          )}
                          <div className={`space-y-1 ${wizardForm.recipientType === 'AREA' ? 'col-span-2' : ''}`}>
                            <label className="font-bold text-slate-500">Số điện thoại</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white transition-all"
                              placeholder="0901234567"
                              disabled
                              value={wizardForm.recipientPhone}
                              onChange={(e) => setWizardForm({...wizardForm, recipientPhone: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="font-bold text-slate-500">Phòng ban nhận (Chọn danh mục) *</label>
                          <select
                            disabled={wizardType === 'RECALL' || wizardType === 'LOCATION_TRANSFER'}
                            value={wizardForm.receiverDepartmentId || ''}
                            onChange={(e) => handleDepartmentSelect(Number(e.target.value))}
                            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white transition-all"
                          >
                            <option value="">-- Chọn phòng ban --</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                          {wizardType !== 'RECALL' && wizardType !== 'LOCATION_TRANSFER' && hasPermission('PERMISSION_MANAGE') && (
                            <a href="/settings/big-data" target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-primary-600 hover:text-primary-700">
                              <Plus className="h-3.5 w-3.5" /> Quản lý tại Big Data Center
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* BÊN GIAO & VỊ TRÍ MỚI */}
                    <div className="space-y-4 p-5 border border-slate-200 rounded-2xl bg-white shadow-sm">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-1.5 border-b pb-2">
                        <MapPin className="h-4 w-4 text-slate-500" />
                        BÊN GIAO & VỊ TRÍ BÀN GIAO ĐẾN
                      </h4>

                      <div className="space-y-3 text-xs">
                        <div className="space-y-1">
                          <label className="font-bold text-slate-550">Họ tên người giao (Bên giao)</label>
                          <select
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white transition-all"
                            value={masterPeople.find((person) => person.fullName === wizardForm.senderName)?.key || (wizardForm.senderName ? '__current_sender__' : '')}
                            onChange={(e) => handleSenderSelect(e.target.value)}
                          >
                            <option value="">-- Chọn người giao --</option>
                            {wizardForm.senderName && !masterPeople.some((person) => person.fullName === wizardForm.senderName) && <option value="__current_sender__" disabled>{wizardForm.senderName} - dữ liệu hiện tại</option>}
                            {masterPeople.map((person) => <option key={person.key} value={person.key}>{person.fullName}{person.departmentName ? ` - ${person.departmentName}` : ''}</option>)}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="font-bold text-slate-500">Chức vụ giao</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white transition-all"
                              value={wizardForm.senderPosition}
                              disabled
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="font-bold text-slate-500">Phòng ban giao</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-205 rounded-xl text-xs font-bold text-slate-800 focus:bg-white transition-all"
                              value={wizardForm.senderDepartment}
                              disabled
                            />
                          </div>
                        </div>

                        {/* DEPENDENT DROPDOWN SYSTEM */}
                        <div className="space-y-3 pt-2 border-t">
                          <div className="space-y-1">
                            <label htmlFor="transfer-destination-city" className="font-bold text-slate-500">Thành phố bàn giao đến *</label>
                            <SearchableLocationSelect
                              id="transfer-destination-city"
                              value={selectedCity}
                              options={availableCities}
                              placeholder="Gõ để chọn thành phố..."
                              onChange={(city) => {
                                setSelectedCity(city);
                                setSelectedProject('');
                                setSelectedLocation('');
                                setSelectedLocationPath([]);
                                setCustomCity('');
                                setCustomProject('');
                                setCustomLocation('');
                                setAddingLocationDepth(null);
                                setNewLocationNodeName('');
                                setAddingCatalogType(null);
                                setNewCatalogName('');
                              }}
                            />
                            {hasPermission('PERMISSION_MANAGE') && (
                              <CatalogAddControl
                                id="new-transfer-city"
                                addLabel="Thêm thành phố"
                                fieldLabel="Tên thành phố"
                                placeholder="Nhập tên thành phố"
                                open={addingCatalogType === 'CITY'}
                                value={addingCatalogType === 'CITY' ? newCatalogName : ''}
                                saving={isCreatingCatalog}
                                onOpen={() => {
                                  setAddingCatalogType('CITY');
                                  setNewCatalogName('');
                                }}
                                onChange={setNewCatalogName}
                                onSubmit={() => handleCreateLocationCatalog('CITY')}
                                onCancel={() => {
                                  setAddingCatalogType(null);
                                  setNewCatalogName('');
                                }}
                              />
                            )}
                          </div>

                          {selectedCity && (
                            <>
                              <div className="space-y-1">
                                <label htmlFor="transfer-destination-project" className="font-bold text-slate-500">Dự án bàn giao đến *</label>
                                <SearchableLocationSelect
                                  id="transfer-destination-project"
                                  value={selectedProject}
                                  options={availableProjects}
                                  placeholder="Gõ để chọn dự án..."
                                  onChange={(project) => {
                                    setSelectedProject(project);
                                    setSelectedLocation('');
                                    setSelectedLocationPath([]);
                                    setCustomProject('');
                                    setCustomLocation('');
                                    setAddingLocationDepth(null);
                                    setNewLocationNodeName('');
                                    setAddingCatalogType(null);
                                    setNewCatalogName('');
                                  }}
                                />
                                {hasPermission('PERMISSION_MANAGE') && (
                                  <CatalogAddControl
                                    id="new-transfer-project"
                                    addLabel="Thêm dự án"
                                    fieldLabel="Tên dự án"
                                    placeholder="Nhập tên dự án"
                                    open={addingCatalogType === 'PROJECT'}
                                    value={addingCatalogType === 'PROJECT' ? newCatalogName : ''}
                                    saving={isCreatingCatalog}
                                    onOpen={() => {
                                      setAddingCatalogType('PROJECT');
                                      setNewCatalogName('');
                                    }}
                                    onChange={setNewCatalogName}
                                    onSubmit={() => handleCreateLocationCatalog('PROJECT')}
                                    onCancel={() => {
                                      setAddingCatalogType(null);
                                      setNewCatalogName('');
                                    }}
                                  />
                                )}
                              </div>
                            </>
                          )}

                          {selectedProject && (
                            <>
                              {projectLocationTree ? (
                                <div className="space-y-3">
                                  {projectLocationLevels.map((options, depth) => {
                                    const labels = PROJECT_LOCATION_LEVEL_LABELS;
                                    return (
                                      <div key={depth} className="space-y-1">
                                        <label htmlFor={`transfer-location-level-${depth}`} className="font-bold text-slate-500">
                                          {labels[depth] || `Phân cấp ${depth + 1}`}{options.length > 0 ? ' *' : ''}
                                        </label>
                                        <SearchableLocationSelect
                                          id={`transfer-location-level-${depth}`}
                                          value={selectedLocationPath[depth] || ''}
                                          options={options}
                                          placeholder={`Gõ để chọn ${labels[depth]?.toLowerCase() || 'vị trí'}...`}
                                          onChange={(location) => {
                                            handleProjectLocationChange(depth, location);
                                            if (addingLocationDepth !== null && addingLocationDepth > depth) {
                                              setAddingLocationDepth(null);
                                              setNewLocationNodeName('');
                                            }
                                          }}
                                        />
                                        {depth < PROJECT_LOCATION_LEVEL_LABELS.length && hasPermission('PERMISSION_MANAGE') && (
                                          <div className="pt-1.5">
                                            {addingLocationDepth !== depth ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setAddingLocationDepth(depth);
                                                  setNewLocationNodeName('');
                                                }}
                                                className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-primary-600 hover:text-primary-700"
                                              >
                                                <Plus className="h-3.5 w-3.5" />
                                                Thêm {(labels[depth] || `phân cấp ${depth + 1}`).toLowerCase()}
                                              </button>
                                            ) : (
                                              <div className="space-y-2 border-l-2 border-primary-200 pl-3 pt-1">
                                                <label
                                                  htmlFor={`new-project-location-${depth}`}
                                                  className="block font-bold text-slate-500"
                                                >
                                                  Tên {labels[depth]?.toLowerCase() || `phân cấp ${depth + 1}`} *
                                                </label>
                                                <input
                                                  id={`new-project-location-${depth}`}
                                                  name={`newProjectLocationLevel${depth + 1}`}
                                                  value={newLocationNodeName}
                                                  onChange={(e) => setNewLocationNodeName(e.target.value)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      e.preventDefault();
                                                      handleCreateProjectLocation(depth);
                                                    }
                                                  }}
                                                  placeholder={`Nhập tên ${labels[depth]?.toLowerCase() || `phân cấp ${depth + 1}`}`}
                                                  maxLength={200}
                                                  autoFocus
                                                  className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:border-primary-500 outline-none"
                                                />
                                                <div className="flex items-center gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleCreateProjectLocation(depth)}
                                                    disabled={isCreatingLocationNode}
                                                    className="h-8 px-3 rounded-lg bg-primary-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-primary-700 disabled:opacity-50"
                                                  >
                                                    {isCreatingLocationNode ? 'Đang thêm...' : 'Thêm và chọn'}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setAddingLocationDepth(null);
                                                      setNewLocationNodeName('');
                                                    }}
                                                    disabled={isCreatingLocationNode}
                                                    className="h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 disabled:opacity-50"
                                                  >
                                                    Hủy
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <label htmlFor="transfer-destination-location" className="font-bold text-slate-500">Vị trí bàn giao đến *</label>
                                  <SearchableLocationSelect
                                    id="transfer-destination-location"
                                    value={selectedLocation}
                                    options={[
                                      ...(selectedCity !== 'Khác' && selectedProject !== 'Khác'
                                        ? (LOCATION_HIERARCHY[selectedCity]?.[selectedProject] || [])
                                        : []),
                                      'Khác'
                                    ]}
                                    placeholder="Gõ để chọn vị trí..."
                                    onChange={(location) => {
                                      setSelectedLocation(location);
                                      setSelectedLocationPath([]);
                                      setCustomLocation('');
                                    }}
                                  />
                                </div>
                              )}

                              {selectedLocation === 'Khác' && (
                                <div className="space-y-1">
                                  <label className="font-bold text-slate-500">Ghi rõ vị trí khác *</label>
                                  <input
                                    type="text"
                                    value={customLocation}
                                    onChange={(e) => setCustomLocation(e.target.value)}
                                    placeholder="Nhập vị trí chi tiết..."
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-202 rounded-xl text-xs font-bold text-slate-800 focus:bg-white transition-all"
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500">Lý do bàn giao / luân chuyển</label>
                      <textarea
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 h-20 resize-none focus:bg-white transition-all"
                        placeholder="Ví dụ: Cấp phát làm việc cho nhân viên mới, điều động công việc..."
                        value={wizardForm.reason}
                        onChange={(e) => setWizardForm({...wizardForm, reason: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500">Ghi chú thêm</label>
                      <textarea
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 h-20 resize-none focus:bg-white transition-all"
                        placeholder="Thêm thông tin mô tả chi tiết, tình trạng..."
                        value={wizardForm.note}
                        onChange={(e) => setWizardForm({...wizardForm, note: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: XÁC NHẬN CAM KẾT */}
              {wizardStep === 4 && (
                <div className="space-y-6 animate-fade-in">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                    BƯỚC 4: XÁC NHẬN CAM KẾT BIÊN BẢN
                  </h3>

                  <div className="p-5 border border-amber-200 rounded-2xl bg-amber-50/20 text-slate-700 text-xs leading-relaxed space-y-4">
                    <div className="flex items-center gap-2 text-amber-600 font-black">
                      <AlertTriangle className="h-5 w-5 shrink-0" />
                      CAM KẾT QUẢN LÝ & SỬ DỤNG TÀI SẢN DOANH NGHIỆP
                    </div>
                    
                    <ul className="list-disc pl-5 space-y-2 font-medium">
                      <li>Bên nhận đã thực hiện kiểm tra đầy đủ chủng loại, số lượng, quy cách và tình trạng thực tế của thiết bị.</li>
                      <li>Bên nhận chịu hoàn toàn trách nhiệm bảo quản, giữ gìn tài sản đúng mục đích công việc, không làm hư hại hoặc mất mát do cẩu thả.</li>
                      <li>
                        {wizardType === 'LOCATION_TRANSFER'
                          ? 'Hệ thống chỉ cập nhật vị trí mới; toàn bộ thông tin phân bổ và trạng thái hiện tại được giữ nguyên.'
                          : `Hệ thống sẽ cập nhật tài sản cho ${wizardForm.recipientType === 'AREA' ? 'khu vực sử dụng và vị trí đã chọn' : 'người nhận'} ngay sau khi hoàn thành biên bản này.`}
                      </li>
                      <li>Bộ phận QLTS/HCNS có quyền kiểm kê định kỳ hoặc đột xuất tài sản được giao.</li>
                    </ul>

                    <div className="flex items-center space-x-3 pt-3 border-t border-amber-100">
                      <input 
                        type="checkbox"
                        id="wizardAgreed"
                        className="h-5 w-5 rounded-lg border-slate-350 text-slate-900 focus:ring-slate-100 cursor-pointer"
                        checked={wizardForm.agreedToCommitment}
                        onChange={(e) => setWizardForm({...wizardForm, agreedToCommitment: e.target.checked})}
                      />
                      <label htmlFor="wizardAgreed" className="text-xs font-black text-slate-900 cursor-pointer select-none">
                        Tôi xác nhận đã đọc, hiểu rõ và đồng ý với các điều khoản cam kết trên *
                      </label>
                    </div>
                  </div>

                  {/* Interactive signatures preview block */}
                  <div className="grid grid-cols-3 gap-4 pt-6">
                    <div className="border border-slate-200 border-dashed rounded-2xl p-5 text-center bg-slate-50/50">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">ĐẠI DIỆN BÊN GIAO</p>
                      <div className="h-16 flex items-center justify-center italic text-slate-300 text-xs font-bold mt-2">Ký điện tử hoặc In ký tay</div>
                      <p className="text-xs font-black text-slate-800 border-t pt-2">{wizardForm.senderName || '---'}</p>
                    </div>
                    <div className="border border-slate-200 border-dashed rounded-2xl p-5 text-center bg-slate-50/50">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">ĐẠI DIỆN BÊN NHẬN</p>
                      <div className="h-16 flex items-center justify-center italic text-slate-300 text-xs font-bold mt-2">Ký điện tử hoặc In ký tay</div>
                      <p className="text-xs font-black text-slate-800 border-t pt-2">
                        {wizardForm.recipientType === 'AREA'
                          ? (wizardForm.recipientName || wizardForm.recipientArea || '---')
                          : (wizardForm.recipientName || '---')}
                      </p>
                    </div>
                    <div className="border border-slate-200 border-dashed rounded-2xl p-5 text-center bg-slate-50/50">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">BỘ PHẬN QLTS / HCNS</p>
                      <div className="h-16 flex items-center justify-center italic text-slate-300 text-xs font-bold mt-2">Đại diện Công ty</div>
                      <p className="text-xs font-black text-slate-850 border-t pt-2">Lê Khánh Hùng</p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: PREVIEW & FINALIZE */}
              {wizardStep === 5 && (
                <div className="space-y-6 animate-fade-in">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                    BƯỚC 5: XEM TRƯỚC HỒ SƠ BIÊN BẢN DỰ KIẾN
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* General Metadata Box */}
                    <div className="md:col-span-1 space-y-4 p-5 bg-slate-900 text-white rounded-2xl shadow-xl flex flex-col justify-between">
                      <div className="space-y-4 text-xs">
                        <div className="border-b border-slate-800 pb-2">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Loại nghiệp vụ</p>
                          <p className="text-sm font-black text-emerald-400 uppercase tracking-widest mt-1">
                            {wizardType === 'HANDOVER'
                              ? 'Bàn giao'
                              : wizardType === 'TRANSFER'
                                ? 'Điều chuyển phòng ban'
                                : wizardType === 'LOCATION_TRANSFER'
                                  ? 'Điều chuyển vị trí'
                                  : 'Thu hồi'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bên giao</p>
                          <p className="font-bold text-slate-200 mt-1">{wizardForm.senderName} - {wizardForm.senderPosition} ({wizardForm.senderDepartment})</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {wizardType === 'LOCATION_TRANSFER'
                              ? 'Phân bổ'
                              : (wizardForm.recipientType === 'AREA' ? 'Khu vực nhận' : 'Bên nhận')}
                          </p>
                          <p className="font-bold text-slate-200 mt-1">
                            {wizardType === 'LOCATION_TRANSFER'
                              ? 'Giữ nguyên người dùng / phòng ban hiện tại'
                              : wizardForm.recipientType === 'AREA'
                              ? wizardForm.recipientArea
                              : wizardForm.recipientName}
                            {wizardType !== 'LOCATION_TRANSFER' && wizardForm.recipientDepartment ? ` (${wizardForm.recipientDepartment})` : ''}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vị trí giao đến</p>
                          <p className="font-bold text-slate-200 mt-1">{getResolvedLocationParts().location || '---'}</p>
                        </div>
                      </div>

                      <div className="border-t border-slate-800 pt-4 mt-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                        Hệ thống sẽ lưu hồ sơ với mã định danh duy nhất và cập nhật sổ tài sản.
                      </div>
                    </div>

                    {/* Assets list Box */}
                    <div className="md:col-span-2 space-y-4">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-2">
                        DANH SÁCH THIẾT BỊ BÀN GIAO ({wizardAssets.length})
                      </h4>

                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {wizardAssets.map(a => (
                          <div key={a.id} className="p-3 border rounded-xl flex items-center justify-between hover:bg-slate-50 transition-all bg-white">
                            <div className="flex items-center space-x-3">
                              <Package className="h-5 w-5 text-slate-400 shrink-0" />
                              <div>
                                <p className="text-xs font-black text-slate-900">{a.assetName}</p>
                                <p className="text-[10px] text-slate-400 font-bold">{a.assetCode} • Serial: {a.serialNumber || '---'}</p>
                              </div>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-slate-100 text-[10px] font-black uppercase tracking-tight text-slate-500">
                              {a.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions Section */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
          <div>
            <button
              type="button"
              disabled={wizardStep === 1 || isSubmitting}
              onClick={() => setWizardStep(prev => prev - 1)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white hover:border-slate-350 disabled:opacity-40 transition-all text-slate-700 flex items-center gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" /> Quay lại
            </button>
          </div>

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white text-slate-600 disabled:opacity-40 transition-all"
            >
              Hủy
            </button>

            {/* In-progress buttons based on steps */}
            {wizardStep < 5 ? (
              <button
                type="button"
                disabled={
                  (wizardStep === 2 && wizardAssets.length === 0) ||
                  (
                    wizardStep === 3
                    && (wizardType === 'HANDOVER' || wizardType === 'TRANSFER')
                    && (
                      (wizardForm.recipientType === 'PERSON' && !wizardForm.recipientName.trim())
                      || (wizardForm.recipientType === 'AREA' && !wizardForm.recipientArea.trim())
                    )
                  ) ||
                  (wizardStep === 3 && (
                    !selectedCity || 
                    !selectedProject || 
                    !selectedLocation || 
                    (selectedCity === 'Khác' && !customCity.trim()) || 
                    (selectedProject === 'Khác' && !customProject.trim()) || 
                    (projectLocationTree && selectedLocation !== 'Khác' && !isLocationPathComplete(projectLocationTree, selectedLocationPath)) ||
                    (selectedLocation === 'Khác' && !customLocation.trim())
                  )) ||
                  (wizardStep === 4 && !wizardForm.agreedToCommitment) ||
                  isSubmitting
                }
                onClick={() => setWizardStep(prev => prev + 1)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-40 transition-all flex items-center gap-1.5"
              >
                Tiếp tục <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                {/* Save Draft */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit('DRAFT')}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-1.5"
                >
                  <Save className="h-4 w-4 text-slate-400" /> Lưu nháp
                </button>

                {/* Save & Complete */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit('COMPLETE')}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Đang xử lý...' : 'Lưu & Hoàn thành'}
                </button>

                {/* Print Direct */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit('PRINT')}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-1.5"
                >
                  <Printer className="h-4 w-4" /> In biên bản
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </BaseModal>
  );
};
