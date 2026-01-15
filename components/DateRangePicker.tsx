import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button, cn } from './LinearUI';

interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

// Helper: Format Date to YYYY-MM-DD
const formatStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper: Display Date (zh-TW)
const formatDisplay = (s: string) => {
    if(!s) return '';
    const [y, m, d] = s.split('-');
    return `${y}年${parseInt(m)}月${parseInt(d)}日`;
};

// Helper: Create a Date object set to NOON (12:00:00) 
// This prevents midnight shifts.
const createNoonDate = (year: number, month: number, day: number) => {
    return new Date(year, month, day, 12, 0, 0);
};

// Presets Definition
const PRESETS = [
    { label: '今天', getRange: () => { const n = new Date(); return { start: formatStr(n), end: formatStr(n) }; } },
    { label: '昨天', getRange: () => { const n = new Date(); n.setDate(n.getDate() - 1); return { start: formatStr(n), end: formatStr(n) }; } },
    { label: '過去 7 天', getRange: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 6); return { start: formatStr(s), end: formatStr(e) }; } },
    { label: '過去 14 天', getRange: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 13); return { start: formatStr(s), end: formatStr(e) }; } },
    { label: '過去 30 天', getRange: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 29); return { start: formatStr(s), end: formatStr(e) }; } },
    { label: '本月', getRange: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth(), 1); const e = new Date(n.getFullYear(), n.getMonth() + 1, 0); return { start: formatStr(s), end: formatStr(e) }; } },
    { label: '上個月', getRange: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth() - 1, 1); const e = new Date(n.getFullYear(), n.getMonth(), 0); return { start: formatStr(s), end: formatStr(e) }; } },
];

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Internal view date (Month being viewed)
  const [viewDate, setViewDate] = useState(() => {
     const parts = value.end.split('-');
     return createNoonDate(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
  });
  
  const [tempStart, setTempStart] = useState<string | null>(value.start);
  const [tempEnd, setTempEnd] = useState<string | null>(value.end);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setTempStart(value.start);
        setTempEnd(value.end);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  useEffect(() => {
     setTempStart(value.start);
     setTempEnd(value.end);
     const parts = value.end.split('-');
     setViewDate(createNoonDate(parseInt(parts[0]), parseInt(parts[1]) - 1, 1));
  }, [value, isOpen]);

  // Quick Nav: Shift Month
  // Logic: Always snap to the 1st of the target month and the last day of the target month.
  // We use the current START date to determine "Current Month".
  const handleShift = (direction: -1 | 1) => {
    // 1. Parse current START date
    const [yStr, mStr] = value.start.split('-');
    const currentYear = parseInt(yStr, 10);
    const currentMonth = parseInt(mStr, 10) - 1; // 0-indexed

    // 2. Calculate Target Month
    // JS Date handles overflow correctly (e.g., month 11 + 1 becomes month 0 of next year)
    // IMPORTANT: We explicitly set day to 1. This prevents "tail of previous month" issues.
    const targetStartDate = createNoonDate(currentYear, currentMonth + direction, 1);
    
    // 3. Calculate Last Day of Target Month
    // (Month + 1, Day 0) gives the last day of the Month.
    const targetEndDate = createNoonDate(
        targetStartDate.getFullYear(), 
        targetStartDate.getMonth() + 1, 
        0
    );
    
    onChange({ 
        start: formatStr(targetStartDate), 
        end: formatStr(targetEndDate) 
    });
  };

  const handleApply = () => {
    if (tempStart && tempEnd) {
        const s = tempStart > tempEnd ? tempEnd : tempStart;
        const e = tempStart > tempEnd ? tempStart : tempEnd;
        onChange({ start: s, end: e });
        setIsOpen(false);
    }
  };

  const handleDateClick = (dateStr: string) => {
      if (!tempStart || (tempStart && tempEnd)) {
          setTempStart(dateStr);
          setTempEnd(null);
      } else {
          if (dateStr < tempStart) {
              setTempEnd(tempStart);
              setTempStart(dateStr);
          } else {
              setTempEnd(dateStr);
          }
      }
  };

  const changeMonth = (delta: number) => {
      setViewDate(prev => createNoonDate(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const renderCalendarMonth = (year: number, month: number) => {
    const startOfMonth = createNoonDate(year, month, 1);
    const endOfMonth = createNoonDate(year, month + 1, 0); 
    const daysInMonth = endOfMonth.getDate();
    const startDay = startOfMonth.getDay(); 
    const adjustedStartDay = startDay === 0 ? 6 : startDay - 1; 

    const days = [];
    for (let i = 0; i < adjustedStartDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
        const d = createNoonDate(year, month, i);
        days.push(formatStr(d));
    }

    return (
        <div className="w-64 p-2">
            <div className="text-center font-medium mb-2 text-zinc-300">
                {year}年 {month + 1}月
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1 text-zinc-500">
                <div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
                {days.map((dateStr, idx) => {
                    if (!dateStr) return <div key={`empty-${idx}`} />;
                    
                    let isSelected = false;
                    let isInRange = false;
                    
                    if (tempStart && tempEnd) {
                        isSelected = dateStr === tempStart || dateStr === tempEnd;
                        isInRange = dateStr > tempStart && dateStr < tempEnd;
                    } else if (tempStart) {
                        isSelected = dateStr === tempStart;
                    }

                    return (
                        <button
                            key={dateStr}
                            onClick={() => handleDateClick(dateStr)}
                            className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center transition-all relative z-10",
                                isSelected ? "bg-[#1877F2] text-white" : "hover:bg-zinc-800 text-zinc-300",
                                isInRange && "bg-[#1877F2]/20 rounded-none w-full mx-[-2px] first:rounded-l-full last:rounded-r-full"
                            )}
                        >
                            {parseInt(dateStr.split('-')[2])}
                        </button>
                    );
                })}
            </div>
        </div>
    );
  };

  const leftDate = createNoonDate(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  const rightDate = createNoonDate(viewDate.getFullYear(), viewDate.getMonth(), 1);

  return (
    <div className={cn("relative", className)} ref={containerRef}>
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-sm h-9">
            <button 
                onClick={() => handleShift(-1)}
                className="h-full px-2 hover:bg-zinc-800 border-r border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="上一個月"
            >
                <ChevronLeft size={16} />
            </button>
            
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={cn("flex items-center gap-2 px-3 h-full text-sm font-medium transition-colors min-w-[240px] justify-center", isOpen ? "bg-zinc-800 text-zinc-200" : "hover:bg-zinc-800/50 text-zinc-300")}
            >
                <CalendarIcon size={14} className="text-zinc-500" />
                <span>{formatDisplay(value.start)} - {formatDisplay(value.end)}</span>
            </button>

            <button 
                onClick={() => handleShift(1)}
                className="h-full px-2 hover:bg-zinc-800 border-l border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="下一個月"
            >
                <ChevronRight size={16} />
            </button>
        </div>

        {isOpen && (
            <div className="absolute top-full right-0 mt-2 z-[9999] bg-[#09090b] border border-zinc-800 rounded-xl shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200 ring-1 ring-black/50">
                <div className="w-40 border-r border-zinc-800 bg-zinc-900/30 p-2 flex flex-col gap-1">
                    <div className="text-xs font-semibold text-zinc-500 px-2 py-1 mb-1">最近用過</div>
                    {PRESETS.map(preset => {
                        const range = preset.getRange();
                        const isActive = range.start === value.start && range.end === value.end;
                        return (
                            <button
                                key={preset.label}
                                onClick={() => {
                                    onChange(range);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                                    isActive ? "bg-indigo-500/10 text-indigo-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                                )}
                            >
                                {preset.label}
                                {isActive && <Check size={12} />}
                            </button>
                        )
                    })}
                </div>

                <div className="p-4">
                    <div className="flex items-center justify-between mb-2 px-2">
                        <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-zinc-800 rounded"><ChevronLeft size={16}/></button>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-300">
                                <span>{tempStart || '開始日期'}</span>
                                <span className="text-zinc-600">-</span>
                                <span>{tempEnd || '結束日期'}</span>
                            </div>
                        </div>
                        <button onClick={() => changeMonth(1)} className="p-1 hover:bg-zinc-800 rounded"><ChevronRight size={16}/></button>
                    </div>
                    
                    <div className="flex gap-4 border-b border-zinc-800/50 pb-4">
                        {renderCalendarMonth(leftDate.getFullYear(), leftDate.getMonth())}
                        <div className="w-px bg-zinc-800" />
                        {renderCalendarMonth(rightDate.getFullYear(), rightDate.getMonth())}
                    </div>

                    <div className="flex justify-end pt-4 gap-2">
                        <Button variant="ghost" onClick={() => setIsOpen(false)}>取消</Button>
                        <Button 
                            className="bg-[#1877F2] hover:bg-[#166fe5] text-white" 
                            disabled={!tempStart || !tempEnd}
                            onClick={handleApply}
                        >
                            更新
                        </Button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
