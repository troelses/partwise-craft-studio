
import React from 'react';
import { Link } from 'react-router-dom';
import { Specialty } from '@/types/document';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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
      <ScrollArea className="h-[200px] pr-4">
        <div className="flex flex-wrap gap-2">
          <Badge 
            key="all" 
            variant={activeSpecialty === 'All' ? "default" : "outline"}
            className="cursor-pointer hover:bg-gray-100" 
            onClick={() => onSpecialtyChange('All')}
          >
            Alle specialer
          </Badge>
          
          {specialties.map((specialty) => (
            <Badge 
              key={specialty} 
              variant={activeSpecialty === specialty ? "default" : "outline"} 
              className="cursor-pointer hover:bg-gray-100"
              onClick={() => onSpecialtyChange(specialty)}
            >
              {specialty}
            </Badge>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SpecialtyList;
