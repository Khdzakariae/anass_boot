import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Upload, FileText, Trash2, Download } from 'lucide-react';

// --- Configuration & Interfaces ---
const API_BASE_URL = 'http://localhost:8080/api/ausbildung';

// This interface now matches your Prisma/Node.js backend model
interface Document {
  id: string;
  filename: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

interface DocumentManagerProps {
  selectedDocuments: string[];
  onDocumentSelect: (documentId: string, checked: boolean) => void;
}

export const DocumentManager: React.FC<DocumentManagerProps> = ({
  selectedDocuments,
  onDocumentSelect
}) => {
  // --- State Management ---
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // --- Helper Functions ---
  const getAuthToken = () => localStorage.getItem('token');

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // --- API Functions ---
  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/documents`, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      if (!response.ok) throw new Error('Failed to fetch documents.');
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadDocument = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file); // ✅ changed 'document' -> 'file'
  
    try {
      const response = await fetch(`${API_BASE_URL}/documents/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` },
        body: formData,
      });
  
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }
      
      toast.success(`'${file.name}' uploaded successfully.`);
      fetchDocuments(); // Refresh the list after upload
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setIsUploading(false);
    }
  };
  

  const deleteDocument = async (documentId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` },
      });

      if (!response.ok) throw new Error('Failed to delete document.');
      
      toast.success('Document deleted.');
      setDocuments(prev => prev.filter(doc => doc.id !== documentId)); // Optimistic UI update
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An unknown error occurred.');
    }
  };
  
  // --- Drag-and-Drop Handler ---
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      await uploadDocument(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    multiple: true
  });
  
  // Fetch documents on initial component load
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);


  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Document Manager
        </CardTitle>
        <CardDescription>
          Upload and manage documents to attach to applications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Area */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium mb-1">
            {isDragActive ? 'Drop files here' : 'Upload Documents'}
          </p>
          <p className="text-xs text-muted-foreground">
            Drag & drop or click to browse (PDF, DOC, DOCX)
          </p>
        </div>

        {isUploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoadingSpinner size="sm" />
            Uploading...
          </div>
        )}

        {/* Documents List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Your Documents ({documents.length})</h4>
            {documents.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => documents.forEach(doc => onDocumentSelect(doc.id, true))}>
                Select All
              </Button>
            )}
          </div>

          {documents.length === 0 && !isUploading ? (
            <div className="text-center py-6 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {documents.map((doc) => (
                <motion.div
                  key={doc.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${selectedDocuments.includes(doc.id) ? 'bg-muted/50 border-primary/30' : 'hover:bg-muted/30'}`}
                >
                  <Checkbox
                    checked={selectedDocuments.includes(doc.id)}
                    onCheckedChange={(checked) => onDocumentSelect(doc.id, checked as boolean)}
                  />
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={doc.originalName}>
                      {doc.originalName}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatFileSize(doc.fileSize)}</span>
                      <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Download functionality would require a separate backend endpoint */}
                    {/* <Button variant="ghost" size="sm"><Download className="w-4 h-4" /></Button> */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteDocument(doc.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};