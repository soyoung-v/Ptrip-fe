import axios from 'axios'

const apiClient = axios.create({
  // 환경변수가 없으면 로컬 백엔드 기본 주소로 연결한다.
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  timeout: 10000,
})

export async function searchTours(keyword) {
  const response = await apiClient.get('/api/tours/search', {
    params: { keyword },
  })

  // 백엔드 공통 응답 형식이 아니면 프론트에서 바로 실패로 처리한다.
  if (!response.data?.success || !Array.isArray(response.data.data)) {
    throw new Error('백엔드 검색 응답 형식이 올바르지 않습니다.')
  }

  return response.data.data
}

export async function fetchTourDetail(contentId) {
  const response = await apiClient.get(`/api/tours/${contentId}`)

  // 상세 API도 동일한 공통 응답 형식을 기대한다.
  if (!response.data?.success || !response.data.data) {
    throw new Error('백엔드 상세 응답 형식이 올바르지 않습니다.')
  }

  return response.data.data
}
