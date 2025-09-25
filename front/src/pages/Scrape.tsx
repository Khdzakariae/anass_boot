import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Progress } from '@/components/ui/progress';

import { 
  Search, 
  MapPin, 
  Hash, 
  Play, 
  CheckCircle,
  ArrowLeft,
  Bot,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

const Scrape = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useState('');
  const [pages, setPages] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scrapingComplete, setScrapingComplete] = useState(false);
  const [jobsFound, setJobsFound] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();
  
    if (!searchTerm) {
      toast.error('Please provide a search term to begin scraping.');
      return;
    }
  
    if (pages < 1 || pages > 10) {
      toast.error('Number of pages must be between 1 and 10');
      return;
    }

    // if (!searchTerm || !location) {
    //   toast.error('Please fill in all required fields');
    //   return;
    // }
  
    // if (pages < 1 || pages > 10) {
    //   toast.error('Number of pages must be between 1 and 10');
    //   return;
    // }
  
    setIsLoading(true);
    setProgress(0);
    setScrapingComplete(false);
    setJobsFound(0);
    const token = localStorage.getItem('token');
  
    try {
      const response = await fetch('http://localhost:3000/api/ausbildung/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          searchTerm,
          location,
          numPages: pages,
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to scrape jobs. Please try again.');
      }
  
      const data = await response.json();
  
      setJobsFound(data.jobsFound || 0);
      setScrapingComplete(true);
      toast.success('Scraping completed successfully!');
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'An error occurred while scraping jobs.');
    } finally {
      setIsLoading(false);
    }
  };
  const handleReset = () => {
    setProgress(0);
    setScrapingComplete(false);
    setJobsFound(0);
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
              <Link to="/Dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-primary flex items-center justify-center">
                <Search className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-3xl font-display font-bold mb-2">Scrape Job Opportunities</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Automatically discover and collect job opportunities from multiple sources. 
              Enter your search criteria to find relevant positions.
            </p>
          </div>
        </motion.div>

        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card className="shadow-elegant">
              <CardHeader>
                <CardTitle className="text-xl font-display flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  Scraping Configuration
                </CardTitle>
                <CardDescription>
                  Configure your job search parameters to find the most relevant opportunities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="searchTerm" className="text-sm font-medium">
                      Search Term *
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="searchTerm"
                        type="text"
                        placeholder="e.g., Pflegefachmann, Krankenpfleger"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                        disabled={isLoading}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter the job title or keywords you're looking for
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-sm font-medium">
                      Location *
                    </Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="location"
                        type="text"
                        placeholder="e.g., München, Berlin, Hamburg"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="pl-10"
                        disabled={isLoading}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      City or region where you want to find jobs
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pages" className="text-sm font-medium">
                      Number of Pages
                    </Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="pages"
                        type="number"
                        min="1"
                        max="10"
                        value={pages}
                        onChange={(e) => setPages(parseInt(e.target.value) || 3)}
                        className="pl-10"
                        disabled={isLoading}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      How many pages to scrape (1-10). Each page contains ~10-15 jobs.
                    </p>
                  </div>

                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4 p-4 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <LoadingSpinner size="sm" />
                        Scraping in progress...
                      </div>
                      <Progress value={progress} className="w-full" />
                      <p className="text-xs text-muted-foreground">
                        Searching {searchTerm} positions in {location}... ({Math.round(progress)}% complete)
                      </p>
                    </motion.div>
                  )}

                  {scrapingComplete && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                    >
                      <div className="flex items-center gap-2 text-green-800 dark:text-green-300 font-medium mb-2">
                        <CheckCircle className="w-5 h-5" />
                        Scraping Completed!
                      </div>
                      <p className="text-sm text-green-700 dark:text-green-400 mb-3">
                        Found {jobsFound} job opportunities for "{searchTerm}" in {location}
                      </p>
                      <div className="flex gap-2">
                        <Button asChild size="sm">
                          <Link to="/dashboard">
                            View Results
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleReset}>
                          Scrape More
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  <Button
                    type="submit"
                    className="w-full hero-button"
                    disabled={isLoading || scrapingComplete}
                  >
                    {isLoading ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Scraping Jobs...
                      </>
                    ) : scrapingComplete ? (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Scraping Complete
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Start Scraping
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-primary mt-0.5" />
                    <div className="text-sm">
                      <h4 className="font-medium mb-1">Pro Tip</h4>
                      <p className="text-muted-foreground">
                        Use specific job titles for better results. The scraper will find positions 
                        from major job boards and company websites automatically.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Scrape;