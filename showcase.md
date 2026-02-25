# Beautiful Mermaid — Showcase

Open this file in Obsidian with the Beautiful Mermaid plugin enabled to see all diagram types rendered with themed SVG and ASCII modes.

Each diagram is shown twice: once in **SVG mode** (default) and once in **ASCII mode** using the `%% ascii` directive.

---

## 1. Flowchart

### SVG

```mermaid
graph TD
    A[User Request] --> B{Authenticated?}
    B -->|Yes| C[Load Dashboard]
    B -->|No| D[Login Page]
    D --> E[Enter Credentials]
    E --> B
    C --> F[Display Data]
```

### ASCII

```mermaid
%% ascii
graph TD
    A[User Request] --> B{Authenticated?}
    B -->|Yes| C[Load Dashboard]
    B -->|No| D[Login Page]
    D --> E[Enter Credentials]
    E --> B
    C --> F[Display Data]
```

---

## 2. Sequence Diagram

### SVG

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Auth
    participant DB

    Client->>API: POST /login
    API->>Auth: Validate credentials
    Auth->>DB: Query user
    DB-->>Auth: User record
    Auth-->>API: JWT token
    API-->>Client: 200 OK + token

    Client->>API: GET /data (Bearer token)
    API->>Auth: Verify token
    Auth-->>API: Valid
    API->>DB: Fetch data
    DB-->>API: Results
    API-->>Client: 200 OK + data
```

### ASCII

```mermaid
%% ascii
sequenceDiagram
    participant Client
    participant API
    participant Auth
    participant DB

    Client->>API: POST /login
    API->>Auth: Validate credentials
    Auth->>DB: Query user
    DB-->>Auth: User record
    Auth-->>API: JWT token
    API-->>Client: 200 OK + token

    Client->>API: GET /data (Bearer token)
    API->>Auth: Verify token
    Auth-->>API: Valid
    API->>DB: Fetch data
    DB-->>API: Results
    API-->>Client: 200 OK + data
```

---

## 3. State Diagram

### SVG

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : Submit
    Processing --> Success : Valid
    Processing --> Error : Invalid
    Error --> Idle : Retry
    Success --> [*]
```

### ASCII

```mermaid
%% ascii
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : Submit
    Processing --> Success : Valid
    Processing --> Error : Invalid
    Error --> Idle : Retry
    Success --> [*]
```

---

## 4. Class Diagram

### SVG

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +fetch()
    }
    class Cat {
        +String color
        +purr()
    }
    Animal <|-- Dog
    Animal <|-- Cat
```

### ASCII

```mermaid
%% ascii
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +fetch()
    }
    class Cat {
        +String color
        +purr()
    }
    Animal <|-- Dog
    Animal <|-- Cat
```

---

## 5. ER Diagram

### SVG

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int id
        date created
    }
    PRODUCT {
        string name
        float price
    }
```

### ASCII

```mermaid
%% ascii
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int id
        date created
    }
    PRODUCT {
        string name
        float price
    }
```
