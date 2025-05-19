
import React from 'react';
import { Specialty } from '@/types/document';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check } from 'lucide-react';

const specialties: Specialty[] = [
  'Akutmedicin',
  'Almen medicin',
  'Anæstesiologi',
  'Arbejdsmedicin',
  'Børne- og ungdomspsykiatri',
  'Dermato-venerologi',
  'Gynækologi og obstetrik',
  'Intern medicinske specialer',
  'Kirurgiske specialer',
  'Klinisk biokemi',
  'Klinisk farmakologi',
  'Klinisk fysiologi og nuklearmedicin',
  'Klinisk genetik',
  'Klinisk immunologi',
  'Klinisk mikrobiologi',
  'Klinisk onkologi',
  'Neurokirurgi',
  'Neurologi',
  'Oftalmologi',
  'Ortopædisk kirurgi',
  'Oto-rhino-laryngologi',
  'Patologisk anatomi og cytologi',
  'Psykiatri',
  'Pædiatri',
  'Radiologi',
  'Retsmedicin',
  'Samfundsmedicin',
];

interface SpecialtyListProps {
  activeCategory: string;
  activeSpecialty: Specialty;
  onSpecialtyChange: (specialty: Specialty) => void;
}

const SpecialtyList: React.FC<SpecialtyListProps> = ({ 
  activeCategory, 
  activeSpecialty, 
  onSpecialtyChange 
}) => {
  // Split specialties into rows for the table
  const specialtiesInRows = () => {
    const result = [];
    // Create rows with 3 specialties per row
    for (let i = 0; i < specialties.length; i += 3) {
      result.push(specialties.slice(i, i + 3));
    }
    return result;
  };

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-gray-500 mb-2">Specialer</h3>
      <ScrollArea className="h-[250px]">
        <Table className="border-collapse">
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Specialer</TableHead>
              <TableHead className="w-1/3">Specialer</TableHead>
              <TableHead className="w-1/3">Specialer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Special row for "All specialties" option */}
            <TableRow 
              className={`cursor-pointer ${activeSpecialty === 'All' ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              onClick={() => onSpecialtyChange('All')}
            >
              <TableCell className="flex items-center gap-2">
                {activeSpecialty === 'All' && <Check className="h-4 w-4 text-blue-600" />}
                <span>Alle specialer</span>
              </TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
            </TableRow>
            
            {/* Specialty rows */}
            {specialtiesInRows().map((row, rowIndex) => (
              <TableRow key={`row-${rowIndex}`}>
                {row.map((specialty, colIndex) => (
                  <TableCell 
                    key={specialty} 
                    className={`cursor-pointer ${
                      activeSpecialty === specialty ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => onSpecialtyChange(specialty)}
                  >
                    <div className="flex items-center gap-2">
                      {activeSpecialty === specialty && <Check className="h-4 w-4 text-blue-600" />}
                      <span>{specialty}</span>
                    </div>
                  </TableCell>
                ))}
                {/* Add empty cells if the row doesn't have 3 specialties */}
                {Array.from({ length: 3 - row.length }).map((_, index) => (
                  <TableCell key={`empty-${rowIndex}-${index}`}></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default SpecialtyList;
