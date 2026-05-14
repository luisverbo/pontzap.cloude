import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClockType, CLOCK_TYPE_LABELS } from '@/types';

interface ClockRecord {
  id: string;
  date: Date;
  type: ClockType;
  time: string;
  location: string;
  method: 'gps' | 'qr';
}

const mockRecords: ClockRecord[] = [
  { id: '1', date: new Date(), type: 'entry', time: '08:00', location: 'Edifício Central', method: 'gps' },
  { id: '2', date: new Date(), type: 'lunch_out', time: '12:00', location: 'Edifício Central', method: 'gps' },
  { id: '3', date: new Date(), type: 'lunch_in', time: '13:00', location: 'Edifício Central', method: 'gps' },
  { id: '4', date: new Date(), type: 'exit', time: '17:00', location: 'Edifício Central', method: 'gps' },
  { id: '5', date: new Date(Date.now() - 86400000), type: 'entry', time: '08:05', location: 'Edifício Central', method: 'qr' },
  { id: '6', date: new Date(Date.now() - 86400000), type: 'exit', time: '17:00', location: 'Edifício Central', method: 'qr' },
];

export default function History() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const getDayRecords = (date: Date) => {
    return mockRecords.filter((record) => isSameDay(record.date, date));
  };

  const selectedRecords = selectedDate ? getDayRecords(selectedDate) : [];

  const getTypeColor = (type: ClockType) => {
    switch (type) {
      case 'entry':
        return 'bg-success/10 text-success border-success/20';
      case 'lunch_out':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'lunch_in':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'exit':
        return 'bg-accent/10 text-accent border-accent/20';
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
            Histórico de Ponto
          </h1>
          <p className="text-muted-foreground mt-1">
            Veja seus registros de ponto
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Calendar */}
          <Card variant="elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Week days header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-medium text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for offset */}
                {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}

                {daysInMonth.map((day) => {
                  const dayRecords = getDayRecords(day);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const hasRecords = dayRecords.length > 0;
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        relative aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all
                        ${isSelected ? 'bg-primary text-primary-foreground shadow-glow' : ''}
                        ${!isSelected && isToday ? 'bg-primary/10 text-primary font-semibold' : ''}
                        ${!isSelected && !isToday ? 'hover:bg-secondary' : ''}
                      `}
                    >
                      <span>{format(day, 'd')}</span>
                      {hasRecords && !isSelected && (
                        <div className="absolute bottom-1 flex gap-0.5">
                          {dayRecords.slice(0, 3).map((_, i) => (
                            <div
                              key={i}
                              className="w-1 h-1 rounded-full bg-success"
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Details */}
          <Card variant="elevated">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                {selectedDate
                  ? format(selectedDate, "d 'de' MMMM", { locale: ptBR })
                  : 'Selecione uma data'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedRecords.length > 0 ? (
                <div className="space-y-3">
                  {selectedRecords.map((record) => (
                    <div
                      key={record.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${getTypeColor(record.type)}`}
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5" />
                        <div>
                          <p className="font-medium">{CLOCK_TYPE_LABELS[record.type]}</p>
                          <div className="flex items-center gap-2 text-xs mt-1 opacity-70">
                            <MapPin className="h-3 w-3" />
                            <span>{record.location}</span>
                            <span>•</span>
                            <span className="uppercase">{record.method}</span>
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-lg font-semibold">{record.time}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold">Sem registros</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Nenhum ponto registrado neste dia
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
