// =============================================================
// net.js — Socket.IO 클라이언트 래퍼
// 서버와의 모든 통신을 이 객체를 통해 처리한다(통신 코드 한 곳 집중).
// =============================================================

window.Net = {
  socket: null,

  // 서버에 연결 (페이지를 서빙한 호스트로 자동 연결 → LAN 접속 시에도 서버 IP로 연결됨)
  connect() {
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('[net] 서버 연결됨:', this.socket.id);
    });
    this.socket.on('disconnect', () => {
      console.log('[net] 서버 연결 끊김');
    });
    this.socket.on('connect_error', (err) => {
      console.warn('[net] 연결 오류:', err.message);
    });

    return this.socket;
  },

  // C→S: 닉네임+비밀번호로 참가 (인증 실패 시 서버가 joinError 반환)
  join(nick, password) {
    this.socket.emit('join', { nick, password });
  },

  // C→S: 이동 보고 (주기적으로 호출)
  sendMove(stateObj) {
    this.socket.emit('move', stateObj);
  },

  // C→S: 공격
  sendAttack(dir) {
    this.socket.emit('attack', { dir });
  },

  // 이벤트 구독 헬퍼
  on(event, cb) {
    this.socket.on(event, cb);
  },

  // 임의 이벤트 전송 헬퍼
  emit(event, data) {
    this.socket.emit(event, data);
  },
};
