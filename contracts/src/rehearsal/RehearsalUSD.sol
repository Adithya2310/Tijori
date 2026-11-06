// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Tichori Rehearsal Dollar (rUSD), a TESTNET-ONLY rehearsal token.
/// @notice Not USDT, not a stablecoin and worth nothing. Anyone can mint any amount. It exists only so
/// the Tichori treasury flow can be rehearsed on Whitechain Sepolia before real test USDT is available.
/// Whitechain hackathon payments must use the official test USDT; payments in this token do not count.
contract RehearsalUSD {
    string public constant name = "Tichori Rehearsal Dollar (testnet, not USDT)";
    string public constant symbol = "rUSD";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        require(block.chainid != 1, "testnet only");
    }

    /// @notice Unlimited, permissionless minting for rehearsal.
    function mint(address to, uint256 value) external {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        allowance[from][msg.sender] -= value;
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) private {
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
