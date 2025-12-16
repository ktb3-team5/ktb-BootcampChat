# 🛡️ Backend Troubleshooting & Performance Tuning

본 문서는 **KTB Chat** 프로젝트의 백엔드 시스템에서 발생한 주요 병목 현상과 이를 해결하기 위한 기술적 의사결정 과정을 상세히 기록한 문서입니다.

---

## 1. 확장성 부재와 동기화 문제 (Scale-out Bottleneck)

### 🔴 Problem: Stateful 아키텍처의 한계
초기 개발 시 서버 메모리(In-Memory)에 유저의 소켓 세션 상태를 저장했습니다. 이로 인해 다음과 같은 치명적인 문제가 발생했습니다.
* **Scale-out 불가:** 서버를 A, B로 증설할 경우, A서버 접속자와 B서버 접속자 간 대화가 불가능함.
* **트래픽 편중:** 모든 트래픽과 상태 관리가 단일 인스턴스에 집중됨.

### 🟢 Action: Redis 도입 및 Stateless 전환
1.  **Redis Pub/Sub 적용:** * Socket.IO 이벤트를 Redis 채널로 브로드캐스팅(Publish)하고, 모든 서버가 이를 구독(Subscribe)하여 클라이언트에게 전달하는 구조로 변경했습니다.
    * 이를 통해 유저가 어떤 서버에 접속해 있든 실시간 메시지 수신이 가능해졌습니다.
2.  **Global Session Store 구축:**
    * 세션 정보와 Rate Limit 데이터를 MongoDB에서 Redis로 이관하여 **In-Memory 속도**를 활용하고 DB I/O 부하를 제거했습니다.
3.  **Redisson 분산 락(Distributed Lock):**
    * 다중 서버 환경에서 동일 유저 세션이 중복 생성되는 Race Condition을 방지하기 위해 분산 락을 적용하여 데이터 무결성을 확보했습니다.

---

## 2. DB I/O 병목 및 쿼리 최적화 (Database Bottleneck)

### 🔴 Problem: N+1 문제 및 과도한 쓰기(Write)
* **N+1 문제:** 채팅방 목록 조회 시, 각 방의 최신 메시지를 가져오기 위해 방의 개수(N)만큼 추가 쿼리가 발생했습니다.
* **잦은 DB 접근:** 소켓 연결 시마다 유저 정보를 DB에서 조회하고, 모든 메시지 읽음 처리를 건별 Update로 수행하여 DB CPU가 100%까지 치솟았습니다.

### 🟢 Action: 배치 처리 및 캐싱 전략
1.  **배치 쿼리(Batch Query) 적용:**
    * `findAllById`, `findByIdIn` 등을 활용하여 수십 번의 쿼리를 **단 1번의 쿼리**로 병합, 조회 성능을 획기적으로 개선했습니다.
2.  **Bulk Update 전환:**
    * 메시지 읽음 처리를 `MongoTemplate.updateMulti`를 사용하여 일괄 처리함으로써 쓰기 작업(Write Ops)을 최소화했습니다.
3.  **Look-aside Caching:**
    * 소켓 연결 시 조회된 유저 정보를 소켓 세션 내부에 캐싱(`client.set`)하여, 이후 메시지 전송 시에는 DB 조회 없이 메모리에서 즉시 참조하도록 변경했습니다.
4.  **Write-Back 전략:**
    * 유저의 '마지막 접속 시간' 등 실시간성이 덜 중요한 데이터는 **1분 주기**로 모아서 DB에 반영하여 불필요한 트랜잭션을 제거했습니다.

---

## 3. 리소스 관리 및 안정성 확보 (Resource Management)

### 🔴 Problem: 이벤트 루프 차단(Blocking)
* Node.js/Netty의 메인 이벤트 루프에서 무거운 DB 작업을 처리하다 보니, 순간적인 블로킹(Blocking)이 발생하여 전체 시스템의 응답성이 저하되었습니다.
* 서버를 증설(Scale-out)하면서 DB 커넥션 수가 기하급수적으로 늘어나 DB 서버가 다운될 위험이 있었습니다.

### 🟢 Action: 스레드 풀 분리 및 커넥션 최적화
1.  **워커 스레드(Worker Thread) 분리:**
    * Netty의 EventLoop는 연결 수립 및 데이터 전송만 전담하게 하고, DB 조회나 비즈니스 로직은 별도의 **Worker Thread Pool**에 위임하여 Non-blocking 아키텍처를 완성했습니다.
2.  **DB Connection Pool 튜닝:**
    * 서버 대수가 늘어남에 따라 각 인스턴스가 점유하는 커넥션 수를 축소(Max 50 → 20)하여, 전체 클러스터 관점에서 DB가 감당 가능한 수준으로 커넥션 총량을 제어했습니다.