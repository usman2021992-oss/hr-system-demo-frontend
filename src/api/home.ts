import apiClient from './client';

export async function getHomeData(timeRange: string = 'this_month'): Promise<any> {
  const { data } = await apiClient.get('/home', { params: { timeRange } });
  return data.data;
}
