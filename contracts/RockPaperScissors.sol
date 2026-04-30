// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BeatTheHouse {
    enum RoundMode {
        Standard,
        Protected
    }

    enum Move {
        None,
        Rock,
        Paper,
        Scissors
    }

    enum RoundState {
        None,
        Active,
        Won,
        Refunded
    }

    struct Round {
        address player;
        address winner;
        Move houseMove;
        Move winningMove;
        Move submittedMove;
        RoundState state;
        uint64 deadline;
        uint128 betAmount;
        uint128 prizeAmount;
        RoundMode mode;
    }

    uint256 public constant MIN_BET = 0.01 ether;
    uint256 public constant ROUND_WINDOW = 5 minutes;
    address public immutable owner;

    uint256 public nextRoundId;
    mapping(uint256 => Round) public rounds;
    mapping(address => uint256) public activeRoundOf;

    event RoundStarted(
        uint256 indexed roundId,
        address indexed player,
        Move houseMove,
        Move winningMove,
        uint256 betAmount,
        uint256 prizeAmount,
        uint64 deadline,
        RoundMode mode
    );
    event RoundWon(uint256 indexed roundId, address indexed winner, Move submittedMove);
    event RoundLost(uint256 indexed roundId, address indexed player, Move submittedMove, Move houseMove);
    event RoundRefunded(uint256 indexed roundId, address indexed player, uint256 amount);
    event Withdrawal(address indexed to, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    function startRound(RoundMode mode) external payable returns (uint256 roundId) {
        require(msg.value >= MIN_BET, "Bet too low");
        require(uint8(mode) <= uint8(RoundMode.Protected), "Invalid mode");

        uint256 encodedRoundId = activeRoundOf[msg.sender];
        if (encodedRoundId != 0 || _roundExistsFor(msg.sender)) {
            Round storage currentRound = rounds[encodedRoundId - 1];
            require(
                currentRound.state == RoundState.None ||
                    currentRound.state == RoundState.Won ||
                    currentRound.state == RoundState.Refunded,
                "Round already active"
            );
        }

        roundId = nextRoundId++;
        Move houseMove = _drawHouseMove(msg.sender, roundId);
        Move winningMove = _winningMoveAgainst(houseMove);
        uint128 betAmount = uint128(msg.value);
        uint128 prizeAmount = uint128(msg.value * _payoutMultiplier(mode));
        require(address(this).balance >= prizeAmount, "Insufficient prize liquidity");

        rounds[roundId] = Round({
            player: msg.sender,
            winner: address(0),
            houseMove: houseMove,
            winningMove: winningMove,
            submittedMove: Move.None,
            state: RoundState.Active,
            deadline: uint64(block.timestamp + ROUND_WINDOW),
            betAmount: betAmount,
            prizeAmount: prizeAmount,
            mode: mode
        });
        activeRoundOf[msg.sender] = roundId + 1;

        emit RoundStarted(
            roundId,
            msg.sender,
            houseMove,
            winningMove,
            betAmount,
            prizeAmount,
            uint64(block.timestamp + ROUND_WINDOW),
            mode
        );
    }

    function playRound(uint256 roundId, Move move) external {
        Round storage round = rounds[roundId];
        require(round.player != address(0), "Round not found");
        require(round.state == RoundState.Active, "Round not active");
        require(block.timestamp <= round.deadline, "Round expired");
        require(move >= Move.Rock && move <= Move.Scissors, "Invalid move");

        round.state = RoundState.Won;
        round.submittedMove = move;
        activeRoundOf[round.player] = 0;

        if (move == round.winningMove) {
            round.winner = msg.sender;

            require(address(this).balance >= round.prizeAmount, "Insufficient contract balance");
            (bool sent, ) = payable(msg.sender).call{value: round.prizeAmount}("");
            require(sent, "Prize transfer failed");

            emit RoundWon(roundId, msg.sender, move);
        } else {
            emit RoundLost(roundId, msg.sender, move, round.houseMove);
        }
    }

    function refundExpiredRound(uint256 roundId) external {
        Round storage round = rounds[roundId];
        require(round.player != address(0), "Round not found");
        require(round.player == msg.sender, "Only player can refund");
        require(round.state == RoundState.Active, "Round not active");
        require(block.timestamp > round.deadline, "Round still active");

        round.state = RoundState.Refunded;
        activeRoundOf[round.player] = 0;

        uint256 refundAmount = round.betAmount;
        (bool sent, ) = payable(round.player).call{value: refundAmount}("");
        require(sent, "Refund transfer failed");

        emit RoundRefunded(roundId, round.player, refundAmount);
    }

    function getRound(uint256 roundId)
        external
        view
        returns (
            address player,
            address winner,
            Move houseMove,
            Move winningMove,
            Move submittedMove,
            RoundState state,
            uint64 deadline,
            uint256 betAmount,
            uint256 prizeAmount,
            RoundMode mode
        )
    {
        Round memory round = rounds[roundId];
        return (
            round.player,
            round.winner,
            round.houseMove,
            round.winningMove,
            round.submittedMove,
            round.state,
            round.deadline,
            round.betAmount,
            round.prizeAmount,
            round.mode
        );
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        _withdraw(to, amount);
    }

    function withdrawAll(address payable to) external onlyOwner {
        _withdraw(to, address(this).balance);
    }

    function _withdraw(address payable to, uint256 amount) internal {
        require(to != address(0), "Invalid recipient");
        require(amount <= address(this).balance, "Insufficient contract balance");

        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Withdraw transfer failed");

        emit Withdrawal(to, amount);
    }

    function _payoutMultiplier(RoundMode mode) internal pure returns (uint256) {
        if (mode == RoundMode.Standard) return 10;
        return 2;
    }

    function _roundExistsFor(address player) internal view returns (bool) {
        uint256 encodedId = activeRoundOf[player];
        if (encodedId == 0) return false;
        return rounds[encodedId - 1].player != address(0);
    }

    function _drawHouseMove(address player, uint256 roundId) internal view returns (Move) {
        uint256 rand = uint256(
            keccak256(abi.encodePacked(block.prevrandao, block.timestamp, player, roundId))
        ) % 3;
        return Move(rand + 1);
    }

    function _winningMoveAgainst(Move move) internal pure returns (Move) {
        if (move == Move.Rock) return Move.Paper;
        if (move == Move.Paper) return Move.Scissors;
        return Move.Rock;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    receive() external payable {}
}
