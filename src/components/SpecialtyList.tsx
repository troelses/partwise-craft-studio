
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
  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-gray-500 mb-2">Specialer</h3>
      <ScrollArea className="h-[350px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Specialer</TableHead>
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
            </TableRow>
            
            {/* One specialty per row */}
            {specialties.map((specialty) => (
              <TableRow 
                key={specialty}
                className={`cursor-pointer ${activeSpecialty === specialty ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => onSpecialtyChange(specialty)}
              >
                <TableCell className="flex items-center gap-2">
                  {activeSpecialty === specialty && <Check className="h-4 w-4 text-blue-600" />}
                  <span>{specialty}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default SpecialtyList;
