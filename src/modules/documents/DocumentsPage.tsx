import React from 'react';
import { DocumentManager } from './components/DocumentManager';

const DocumentsPage: React.FC = () => {
  return (
    <div className="page-enter" style={{ width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
      <DocumentManager showPageHeader={true} />
    </div>
  );
};

export default DocumentsPage;

