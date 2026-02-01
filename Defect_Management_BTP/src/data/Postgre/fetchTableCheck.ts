import axios, { AxiosResponse } from 'axios';
import { API_BASE_URL } from '../../config/api'
interface TableCheckResponse {
  status: string;
  tables: string[];
}

export async function fetchTableCheck(): Promise<TableCheckResponse> {
  try {
    const response: AxiosResponse<TableCheckResponse> =
      // await axios.get('http://localhost:4000/api/postgres/table-check');
      // await axios.get('http://203.228.135.28:4000/api/postgres/table-check');
      // await axios.get('/api/postgres/table-check');
      await axios.get(`${API_BASE_URL}/api/postgres/table-check`);
    return response.data;
  } catch (error) {
    console.error('Error fetching table check:', error);
    throw error;
  }
}
