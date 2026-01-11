import React, { useState, useEffect } from 'react';
import { searchDtic, searchOdin, searchUsace, searchPublog, searchNga, searchPeriscope, searchJanes, searchGtdb } from '../services/intelligence';
import { NewHeader } from '../components/NewHeader';

interface SearchResult {
  id: number;
  title: string;
  source: string;
  date: string;
  summary: string;
  report_url?: string; // Optional link to a full report
  classification?: string; // e.g., UNCLASSIFIED
}

const Intelligence = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSelectedResult(null); // Clear selection on new search
    const [dticResults, odinResults, usaceResults, publogResults, ngaResults, periscopeResults, janesResults, gtdbResults] = await Promise.all([
      searchDtic(searchTerm),
      searchOdin(searchTerm),
      searchUsace(searchTerm),
      searchPublog(searchTerm),
      searchNga(searchTerm),
      searchPeriscope(searchTerm),
      searchJanes(searchTerm),
      searchGtdb(searchTerm),
    ]);
    const combinedResults = [...dticResults, ...odinResults, ...usaceResults, ...publogResults, ...ngaResults, ...periscopeResults, ...janesResults, ...gtdbResults].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setResults(combinedResults);
    setLoading(false);
    if (combinedResults.length > 0) {
      setSelectedResult(combinedResults[0]);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      const [dticResults, odinResults, usaceResults, publogResults, ngaResults, periscopeResults, janesResults, gtdbResults] = await Promise.all([
        searchDtic(''),
        searchOdin(''),
        searchUsace(''),
        searchPublog(''),
        searchNga(''),
        searchPeriscope(''),
        searchJanes(''),
        searchGtdb(''),
      ]);
      const combinedResults = [...dticResults, ...odinResults, ...usaceResults, ...publogResults, ...ngaResults, ...periscopeResults, ...janesResults, ...gtdbResults].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setResults(combinedResults);
      setLoading(false);
      if (combinedResults.length > 0) {
        setSelectedResult(combinedResults[0]);
      }
    };
    loadInitialData();
  }, []);

  return (
    <div className="bg-black text-white min-h-screen">
      <NewHeader />
      <div className="container mx-auto px-6 py-24 space-y-8">
        <h1 className="text-4xl font-bold">Intelligence & Research</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4">
              <form onSubmit={handleSearch}>
                <div className="flex space-x-4">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search sources..."
                    className="flex-grow bg-black/20 text-white placeholder-gray-500 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg" disabled={loading}>
                    {loading ? '...' : 'Go'}
                  </button>
                </div>
              </form>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 h-[70vh] overflow-y-auto pr-2">
              {loading ? (
                <div className="text-center p-8">
                  <p>Loading...</p>
                </div>
              ) : (
                results.map(result => (
                  <div 
                    key={result.id} 
                    className={`bg-black/20 p-4 rounded-lg cursor-pointer border-2 mb-4 ${selectedResult?.id === result.id ? 'border-blue-500' : 'border-transparent hover:border-gray-700'}`}
                    onClick={() => setSelectedResult(result)}
                  >
                    <h3 className="text-lg font-bold truncate">{result.title}</h3>
                    <p className="text-sm text-gray-400">{result.source} - {result.date}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-6 h-[80vh] overflow-y-auto">
            {selectedResult ? (
              <div>
                <h2 className="text-3xl font-bold">{selectedResult.title}</h2>
                <div className="flex items-center space-x-4 text-md text-gray-400 mt-2">
                  <span>Source: {selectedResult.source}</span>
                  <span>Date: {selectedResult.date}</span>
                  {selectedResult.classification && (
                    <span className="bg-gray-700 text-gray-200 px-2 py-1 rounded-md text-sm">{selectedResult.classification}</span>
                  )}
                </div>
                <p className="mt-6 text-gray-300 whitespace-pre-wrap">{selectedResult.summary}</p>
                {selectedResult.report_url && (
                  <div className="mt-6">
                    <a 
                      href={selectedResult.report_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-500 hover:underline"
                    >
                      View Full Report
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">{loading ? 'Loading results...' : 'No result selected or found.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Intelligence;