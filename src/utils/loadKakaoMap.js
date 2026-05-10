let kakaoMapPromise

export function loadKakaoMap() {
  // 이미 로딩을 시작했다면 같은 Promise를 재사용해 중복 스크립트 삽입을 막는다.
  if (kakaoMapPromise) {
    return kakaoMapPromise
  }

  kakaoMapPromise = new Promise((resolve, reject) => {
    const appKey = import.meta.env.VITE_KAKAO_MAP_KEY

    if (!appKey) {
      reject(new Error('VITE_KAKAO_MAP_KEY가 설정되지 않았습니다.'))
      return
    }

    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve(window.kakao))
      return
    }

    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`
    script.async = true

    // SDK 로드가 끝나면 kakao.maps.load로 실제 지도 객체를 초기화한다.
    script.onload = () => {
      window.kakao.maps.load(() => resolve(window.kakao))
    }

    script.onerror = () => {
      reject(new Error('카카오맵 SDK를 불러오지 못했습니다.'))
    }

    document.head.appendChild(script)
  })

  return kakaoMapPromise
}
