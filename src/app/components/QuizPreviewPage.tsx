import { Navigate, useParams } from 'react-router';
import WeeklyTest from './WeeklyTest';
import FinalTest from './FinalTest';

export default function QuizPreviewPage() {
  const { type } = useParams();
  if (type === 'weekly') return <WeeklyTest />;
  if (type === 'knowledge') return <FinalTest />;
  return <Navigate to="/admin" replace />;
}
