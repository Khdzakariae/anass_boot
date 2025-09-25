import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  User,
  Mail,
  Target
} from 'lucide-react';

interface SendTypeSelectorProps {
  sendType: 'all' | 'individual';
  onSendTypeChange: (type: 'all' | 'individual') => void;
  selectedJobsCount: number;
}

export const SendTypeSelector: React.FC<SendTypeSelectorProps> = ({
  sendType,
  onSendTypeChange,
  selectedJobsCount
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" />
          Send Method
        </CardTitle>
        <CardDescription>
          Choose how to send your applications
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup 
          value={sendType} 
          onValueChange={onSendTypeChange}
          className="space-y-4"
        >
          <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/30 transition-colors">
            <RadioGroupItem value="all" id="send-all" className="mt-1" />
            <div className="flex-1 space-y-2">
              <Label htmlFor="send-all" className="flex items-center gap-2 font-medium cursor-pointer">
                <Users className="w-4 h-4" />
                Send to All
                <Badge variant="secondary" className="text-xs">
                  {selectedJobsCount} emails
                </Badge>
              </Label>
              <p className="text-sm text-muted-foreground">
                Send the same email with your documents to all selected employers at once. 
                Faster and simpler for bulk applications.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Same email content
                </span>
                <span>• Batch sending</span>
                <span>• Time efficient</span>
              </div>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/30 transition-colors">
            <RadioGroupItem value="individual" id="send-individual" className="mt-1" />
            <div className="flex-1 space-y-2">
              <Label htmlFor="send-individual" className="flex items-center gap-2 font-medium cursor-pointer">
                <User className="w-4 h-4" />
                Send Individually
                <Badge variant="outline" className="text-xs">
                  {selectedJobsCount} separate emails
                </Badge>
              </Label>
              <p className="text-sm text-muted-foreground">
                Send personalized emails to each employer with their specific job details. 
                More personal but takes longer to process.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Personalized content
                </span>
                <span>• Individual sending</span>
                <span>• More professional</span>
              </div>
            </div>
          </div>
        </RadioGroup>

        {selectedJobsCount === 0 && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              Select jobs to see email count
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};