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
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

const Generate = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [lettersGenerated, setLettersGenerated] = useState(0);
  const token = localStorage.getItem("token");

  
  // MODIFIED: State to hold the number of jobs that need letters, fetched from the API
  const [jobsToProcess, setJobsToProcess] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // MODIFIED: useEffect to fetch the number of pending jobs when the component loads
  useEffect(() => {
    const fetchPendingJobsCount = async () => {
      try {
        const response = await fetch("http://localhost:3000/api/ausbildung/stats", {
          headers: { Authorization: `Bearer ${token}` },

        });
        const stats = await response.json();
        const pendingCount = stats.totalJobs - stats.jobsWithMotivationLetters;
        setJobsToProcess(pendingCount >= 0 ? pendingCount : 0);
      } catch (error) {
        toast.error(error.message || 'Failed to get stats from the server.');
      }
    };

    fetchPendingJobsCount();
  }, []); // Empty array ensures this runs only once on mount

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
      toast.success('CV uploaded successfully');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
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

  // MODIFIED: This function now makes a real API call
  const handleGenerate = async () => {
    if (!selectedFile) {
      toast.error('Please upload your CV first');
      return;
    }

    setIsGenerating(true);
    setGenerationComplete(false);

    // Use FormData to send the file to the backend
    const formData = new FormData();
    formData.append('cv', selectedFile);

    try {
      const response = await fetch('http://localhost:3000/api/ausbildung/generate-letters', {
        method: 'POST',
        body: formData, // The browser will automatically set the correct headers
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Letter generation failed.');
      }

      const result = await response.json();
      setLettersGenerated(result.generatedCount || 0);
      setGenerationComplete(true);
      toast.success(`Successfully generated ${result.generatedCount || 0} motivation letters!`);

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
          </div>
        </motion.div>

        <div className="max-w-2xl mx-auto space-y-6">
          {/* File Upload Section */}
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
                  disabled={!selectedFile || isGenerating || generationComplete || jobsToProcess === 0}
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