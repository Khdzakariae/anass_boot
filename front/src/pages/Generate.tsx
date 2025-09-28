import React, { useState, useEffect, useRef } from 'react'; // Import useEffect
import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  Upload, 
  FileText, 
  Bot, 
  CheckCircle,
  ArrowLeft,
  Wand2,
  FileCheck,
  X,
  File,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

type CvOption = 'upload' | 'existing';

type ExistingCv = {
  id: string;
  name: string;
  createdAt: string;
  size?: string;
};

const Generate = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [lettersGenerated, setLettersGenerated] = useState(0);
  const [existingCVs, setExistingCVs] = useState<ExistingCv[]>([]);
  const [selectedExistingCV, setSelectedExistingCV] = useState<string>('');
  const [cvOption, setCvOption] = useState<CvOption>('upload');
  const token = localStorage.getItem("token");

  
  // MODIFIED: State to hold the number of jobs that need letters, fetched from the API
  const [jobsToProcess, setJobsToProcess] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // MODIFIED: useEffect to fetch the number of pending jobs and existing CVs when the component loads
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch stats
        const response = await fetch("http://localhost:3000/api/ausbildung/stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const stats = await response.json();
        const pendingCount = stats.totalJobs - stats.jobsWithMotivationLetters;
        setJobsToProcess(pendingCount >= 0 ? pendingCount : 0);

        // Fetch existing CVs from documents endpoint
        try {
          const documentsResponse = await fetch("http://localhost:3000/api/ausbildung/documents", {
            method: 'GET',
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (documentsResponse.ok) {
            const documents = await documentsResponse.json();
            // Filter documents that could be CVs
            const cvDocuments = documents.filter(doc => 
              doc.originalName.toLowerCase().includes('cv') || 
              doc.originalName.toLowerCase().includes('lebenslauf') ||
              doc.mimeType === 'application/pdf'
            ).map(doc => ({
              id: doc.id,
              name: doc.originalName,
              createdAt: doc.createdAt,
              size: `${(doc.fileSize / 1024).toFixed(1)} KB`
            }));
            
            setExistingCVs(cvDocuments);
            
            // If we have existing CVs, default to existing option
            if (cvDocuments.length > 0) {
              setCvOption('existing');
              setSelectedExistingCV(cvDocuments[0].id);
            }
          }
        } catch (cvError) {
          console.log('No existing CVs found or error fetching documents:', cvError);
        }
      } catch (error) {
        toast.error('Failed to get stats from the server.');
      }
    };

    fetchData();
  }, []); // Empty array ensures this runs only once on mount

  // Function to refresh existing CVs list
  const refreshExistingCVs = async () => {
    try {
      const documentsResponse = await fetch("http://localhost:3000/api/ausbildung/documents", {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (documentsResponse.ok) {
        const documents = await documentsResponse.json();
        // Filter documents that could be CVs
        const cvDocuments = documents.filter(doc => 
          doc.originalName.toLowerCase().includes('cv') || 
          doc.originalName.toLowerCase().includes('lebenslauf') ||
          doc.mimeType === 'application/pdf'
        ).map(doc => ({
          id: doc.id,
          name: doc.originalName,
          createdAt: doc.createdAt,
          size: `${(doc.fileSize / 1024).toFixed(1)} KB`
        }));
        
        setExistingCVs(cvDocuments);
        setSelectedExistingCV(prev => prev || (cvDocuments[0]?.id ?? ''));
      }
    } catch (error) {
      console.log('Error refreshing CVs:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Please select a PDF file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('File size must be less than 5MB');
        return;
      }
      setSelectedFile(file);
      setCvOption('upload');
      toast.success('CV uploaded successfully');
    }
  };

  const handleCvOptionChange = (value: string) => {
    const option = value as CvOption;
    setCvOption(option);

    if (option === 'upload') {
      setSelectedExistingCV('');
      return;
    }

    // Switching to existing CVs
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setSelectedExistingCV(prev => prev || (existingCVs[0]?.id ?? ''));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setCvOption('upload');
      toast.success('CV uploaded successfully');
    } else {
      toast.error('Please drop a valid PDF file.');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // MODIFIED: This function now makes a real API call with CV options
  const handleGenerate = async () => {
    if (cvOption === 'upload' && !selectedFile) {
      toast.error('Please upload your CV first');
      return;
    }
    
    if (cvOption === 'existing' && !selectedExistingCV) {
      toast.error('Please select an existing CV');
      return;
    }

    setIsGenerating(true);
    setGenerationComplete(false);

    try {
      let response;
      
      if (cvOption === 'upload') {
        // Upload new CV
        const formData = new FormData();
        formData.append('cv', selectedFile);
        
        response = await fetch('http://localhost:3000/api/ausbildung/generate-letters', {
          method: 'POST',
          body: formData,
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        // Use existing CV
        const formData = new FormData();
        formData.append('useExistingCv', 'true');
        formData.append('existingCvId', selectedExistingCV);
        
        response = await fetch('http://localhost:3000/api/ausbildung/generate-letters', {
          method: 'POST',
          body: formData,
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Letter generation failed.');
      }

      const result = await response.json();
      setLettersGenerated(result.generatedCount || 0);
      setGenerationComplete(true);
      
      // If we uploaded a new CV, refresh the existing CVs list
      if (cvOption === 'upload') {
        await refreshExistingCVs();
      }
      
      toast.success(`Successfully generated ${result.generatedCount || 0} motivation letters using ${result.cvSource} CV!`);

    } catch (error) {
      console.error(error);
      toast.error(error.message || 'An error occurred during letter generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setGenerationComplete(false);
    setLettersGenerated(0);
    // Optionally refetch stats here if needed
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-primary flex items-center justify-center">
                <Bot className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-3xl font-display font-bold mb-2">Generate Motivation Letters</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Upload your CV and let AI create personalized motivation letters for all your scraped job opportunities.
            </p>
            
            {/* CV Selection Options */}
            {existingCVs.length > 0 && (
              <div className="mt-6 max-w-md mx-auto">
                <RadioGroup value={cvOption} onValueChange={handleCvOptionChange} className="flex gap-6 justify-center">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="upload" id="upload" />
                    <Label htmlFor="upload">Upload New CV</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="existing" />
                    <Label htmlFor="existing">Use Existing CV</Label>
                  </div>
                </RadioGroup>
              </div>
            )}
          </div>
        </motion.div>

        <div className="max-w-2xl mx-auto space-y-6">
          {/* Existing CV Selection */}
          {cvOption === 'existing' && existingCVs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <Card className="shadow-elegant">
                <CardHeader>
                  <CardTitle className="text-xl font-display flex items-center gap-2">
                    <File className="w-5 h-5 text-primary" />
                    Select Existing CV
                  </CardTitle>
                  <CardDescription>
                    Choose from your previously uploaded CV documents.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {existingCVs.map((cv) => (
                      <div 
                        key={cv.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          selectedExistingCV === cv.id
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover:border-primary/50'
                        }`}
                        onClick={() => setSelectedExistingCV(cv.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="w-8 h-8 text-primary" />
                            <div>
                              <h4 className="font-medium">{cv.name}</h4>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(cv.createdAt).toLocaleDateString()}
                                {cv.size && ` • ${cv.size}`}
                              </p>
                            </div>
                          </div>
                          {selectedExistingCV === cv.id && (
                            <CheckCircle className="w-5 h-5 text-primary" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* File Upload Section */}
          {cvOption === 'upload' && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <Card className="shadow-elegant">
                <CardHeader>
                  <CardTitle className="text-xl font-display flex items-center gap-2">
                    <Upload className="w-5 h-5 text-primary" />
                    Upload Your CV
                  </CardTitle>
                  <CardDescription>
                    Upload your CV in PDF format (max 5MB). This will be used to generate personalized motivation letters.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!selectedFile ? (
                    <div
                      className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">Drop your CV here</h3>
                      <p className="text-muted-foreground mb-4">
                        or click to browse
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-10 h-10 text-primary" />
                        <div>
                          <h4 className="font-medium">{selectedFile.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={removeFile}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Generation Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card className="shadow-elegant">
              <CardHeader>
                <CardTitle className="text-xl font-display flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-primary" />
                  AI Letter Generation
                </CardTitle>
                <CardDescription>
                  Generate letters for all scraped jobs that don't have one yet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <FileCheck className="w-4 h-4 text-primary" />
                    Jobs Ready for Letter Generation
                  </div>
                  <p className="text-2xl font-bold font-display text-primary">{jobsToProcess} Jobs</p>
                </div>

                {isGenerating && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 p-4 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <LoadingSpinner size="sm" />
                      Generating letters... This may take several minutes.
                    </div>
                  </motion.div>
                )}

                {generationComplete && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                  >
                    <div className="flex items-center gap-2 text-green-800 dark:text-green-300 font-medium mb-2">
                      <CheckCircle className="w-5 h-5" />
                      Generation Complete!
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-400 mb-3">
                      Successfully generated {lettersGenerated} personalized motivation letters.
                    </p>
                    <div className="flex gap-2">
                      <Button asChild size="sm">
                        <Link to="/dashboard">
                          View Dashboard
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleReset}>
                        Generate More
                      </Button>
                    </div>
                  </motion.div>
                )}

                <Button
                  onClick={handleGenerate}
                  className="w-full hero-button"
                  disabled={
                    isGenerating ||
                    generationComplete ||
                    jobsToProcess === 0 ||
                    (cvOption === 'upload' ? !selectedFile : !selectedExistingCV)
                  }
                >
                  {isGenerating ? (
                    <><LoadingSpinner size="sm" className="mr-2" />Generating...</>
                  ) : generationComplete ? (
                    <><CheckCircle className="mr-2 h-4 w-4" />Complete</>
                  ) : (
                    <><Wand2 className="mr-2 h-4 w-4" />Generate ({jobsToProcess}) Letters</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Generate;