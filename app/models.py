from pydantic import BaseModel, Field

class QuestionMeta(BaseModel):
    id: int
    objective: str
    topic: str

class QuestionOut(BaseModel):
    """Payload returned by GET /question."""
    id: int = Field(...)
    objective: str = Field(...)


class AnswerIn(BaseModel):
    """Body expected by POST /answer."""
    id: int = Field(...)
    cmd: str = Field(...)


class AnswerOut(BaseModel):
    """Grader verdict."""
    correct: bool
    feedback: str
